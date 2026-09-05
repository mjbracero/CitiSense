import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyOffsetPagination, computeOffsetHasMore, waitOffsetPageDelay } from "./complaintPagination";
import { supabase } from "./supabase";

const LOCAL_PREFIX = "citisense.audit_logs.v1:";
const SEEDED_PREFIX = "citisense.audit_logs.seeded:";
const MAX_LOCAL_LOGS = 150;
export const AUDIT_LOGS_PAGE_SIZE = 15;
const memoryByUser = new Map();

function roleLabel(role) {
  const clean = String(role || "").toLowerCase();

  if (clean === "admin") return "Admin";
  if (clean === "moderator" || clean === "departmenthead") {
    return "Department Head";
  }

  return "Citizen";
}

function createLogId() {
  const cryptoObj = globalThis.crypto;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function localKey(userId) {
  return `${LOCAL_PREFIX}${userId}`;
}

function sortLogs(logs) {
  return [...logs].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function mergeLogs(...lists) {
  const map = new Map();

  for (const list of lists) {
    for (const log of list || []) {
      if (log?.id) map.set(String(log.id), log);
    }
  }

  return sortLogs([...map.values()]);
}

function isMissingTableError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("audit_logs") && message.includes("schema cache")) ||
    message.includes("does not exist")
  );
}

async function readLocalLogs(userId) {
  if (!userId) return [];

  if (memoryByUser.has(userId)) {
    return memoryByUser.get(userId);
  }

  try {
    const raw = await AsyncStorage.getItem(localKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    const logs = Array.isArray(parsed) ? parsed : [];
    memoryByUser.set(userId, logs);
    return logs;
  } catch {
    return [];
  }
}

async function persistLocalLogs(userId, logs) {
  const next = sortLogs(logs).slice(0, MAX_LOCAL_LOGS);
  memoryByUser.set(userId, next);

  try {
    await AsyncStorage.setItem(localKey(userId), JSON.stringify(next));
  } catch (error) {
    console.log("Audit log local persist error:", error);
  }

  return next;
}

async function appendLocalLog(userId, entry) {
  const current = await readLocalLogs(userId);
  return persistLocalLogs(userId, mergeLogs(current, [entry]));
}

function toRemoteRow(entry) {
  const metadata = { ...(entry.metadata || {}) };
  delete metadata._synced;

  return {
    id: entry.id,
    user_id: entry.user_id,
    actor_role: entry.actor_role,
    actor_name: entry.actor_name,
    action: entry.action,
    title: entry.title,
    description: entry.description || "",
    entity_type: entry.entity_type || null,
    entity_id: entry.entity_id ? String(entry.entity_id) : null,
    metadata,
    created_at: entry.created_at,
  };
}

async function syncLocalLogsToRemote(userId) {
  const local = await readLocalLogs(userId);
  const pending = local.filter((log) => !log?.metadata?._synced);

  if (!pending.length) return;

  let next = local;

  for (const log of pending) {
    const { error } = await supabase.from("audit_logs").insert(toRemoteRow(log));

    if (!error || String(error?.code) === "23505") {
      next = next.map((item) =>
        item.id === log.id
          ? { ...item, metadata: { ...item.metadata, _synced: true } }
          : item
      );
      continue;
    }

    if (isMissingTableError(error)) break;

    console.log("Audit log write error:", error);
  }

  await persistLocalLogs(userId, next);
}

async function seedRecentProfileActivity(user, role) {
  if (!user?.id) return;

  const seededKey = `${SEEDED_PREFIX}${user.id}`;

  try {
    if (await AsyncStorage.getItem(seededKey)) return;
  } catch {
    return;
  }

  const updatedAt = user.updated_at ? new Date(user.updated_at).getTime() : 0;
  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
  const hasAccountEdit =
    updatedAt && (!createdAt || updatedAt - createdAt > 10_000);

  if (hasAccountEdit) {
    const actorRole = role || user.user_metadata?.role || "citizen";
    const actorName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "CitiSense user";

    await appendLocalLog(user.id, {
      id: createLogId(),
      user_id: user.id,
      actor_role: actorRole,
      actor_name: actorName,
      action: "profile_update",
      title: "Profile Updated",
      description: "Account information was updated.",
      entity_type: "profile",
      entity_id: user.id,
      metadata: {
        actor_role_label: roleLabel(actorRole),
        seeded: true,
      },
      created_at: user.updated_at,
    });

    if (user.user_metadata?.avatar_url) {
      await appendLocalLog(user.id, {
        id: createLogId(),
        user_id: user.id,
        actor_role: actorRole,
        actor_name: actorName,
        action: "avatar_update",
        title: "Profile Picture Updated",
        description: "Profile picture was changed.",
        entity_type: "profile",
        entity_id: user.id,
        metadata: {
          actor_role_label: roleLabel(actorRole),
          seeded: true,
        },
        created_at: user.updated_at,
      });
    }
  }

  try {
    await AsyncStorage.setItem(seededKey, "1");
  } catch {
    // A later fetch can try seeding again.
  }
}

export async function writeAuditLog({
  action,
  title,
  description = "",
  entityType = null,
  entityId = null,
  metadata = {},
  actorRole = null,
  actorName = null,
} = {}) {
  try {
    if (!action || !title) {
      return { success: false };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return { success: false };
    }

    let role = actorRole;
    let name = actorName;

    if (!role || !name) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      role = role || profile?.role || "citizen";
      name =
        name ||
        profile?.full_name ||
        profile?.email ||
        user.email ||
        "CitiSense user";
    }

    const entry = {
      id: createLogId(),
      user_id: user.id,
      actor_role: role,
      actor_name: name,
      action,
      title,
      description,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      metadata: {
        ...metadata,
        actor_role_label: roleLabel(role),
      },
      created_at: new Date().toISOString(),
    };

    await appendLocalLog(user.id, entry);

    const { error } = await supabase.from("audit_logs").insert(toRemoteRow(entry));

    if (!error || String(error?.code) === "23505") {
      const local = await readLocalLogs(user.id);
      await persistLocalLogs(
        user.id,
        local.map((item) =>
          item.id === entry.id
            ? { ...item, metadata: { ...item.metadata, _synced: true } }
            : item
        )
      );
      return { success: true, log: entry };
    }

    if (!isMissingTableError(error)) {
      console.log("Audit log write error:", error);
    }

    return { success: true, log: entry, remoteError: error };
  } catch (error) {
    console.log("Audit log write catch:", error);
    return { success: false, error };
  }
}

export async function fetchAuditLogs({
  offset = 0,
  pageSize = AUDIT_LOGS_PAGE_SIZE,
} = {}) {
  try {
    await waitOffsetPageDelay(offset);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return {
        success: false,
        logs: [],
        total: 0,
        hasMore: false,
        remotePageLength: 0,
      };
    }

    const {
      data: profile,
    } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    await seedRecentProfileActivity(user, profile?.role);
    await syncLocalLogsToRemote(user.id);

    const local = await readLocalLogs(user.id);
    const ownLocal = local.filter(
      (log) => String(log?.user_id) === String(user.id)
    );

    // Always account-scoped: each user only sees their own activity.
    const { data, error, count } = await applyOffsetPagination(
      supabase
        .from("audit_logs")
        .select(
          "id, user_id, actor_role, actor_name, action, title, description, entity_type, entity_id, metadata, created_at",
          { count: "exact" }
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      offset,
      pageSize
    );

    if (error) {
      if (!isMissingTableError(error)) {
        console.log("Audit log fetch error:", error);
      }

      const page = ownLocal.slice(offset, offset + pageSize);
      const total = ownLocal.length;

      return {
        success: true,
        logs: page,
        total,
        hasMore: computeOffsetHasMore({
          loadedCount: offset + page.length,
          lastPageLength: page.length,
          total,
          pageSize,
        }),
        remotePageLength: 0,
        remoteError: error,
      };
    }

    const remoteRows = data || [];
    const total = count ?? 0;
    let logs = remoteRows;

    if (offset === 0) {
      logs = mergeLogs(remoteRows, ownLocal).filter(
        (log) => String(log?.user_id) === String(user.id)
      );
    }

    const remoteLoaded = offset + remoteRows.length;

    return {
      success: true,
      logs,
      total,
      hasMore: computeOffsetHasMore({
        loadedCount: remoteLoaded,
        lastPageLength: remoteRows.length,
        total,
        pageSize,
      }),
      remotePageLength: remoteRows.length,
    };
  } catch (error) {
    console.log("Audit log fetch catch:", error);
    return {
      success: false,
      logs: [],
      total: 0,
      hasMore: false,
      remotePageLength: 0,
      error,
    };
  }
}

export { roleLabel };

import AsyncStorage from "@react-native-async-storage/async-storage";
import { resetProfileAvatarSession } from "./profileAvatarService";
import { clearProfileAvatar } from "./profileAvatarStore";
import { clearCitizenProfileCache } from "./citizenProfileCache";
import { clearComplaintPhotoCache } from "./complaintPhotoCache";
import { resetNavigationPersistenceSession, clearLastRoutesForUser } from "./navigationPersistence";

const pageCache = new Map();
let activeUserId = null;
let hydratePromise = null;

const PERSISTENT_CACHE_KEYS = new Set([
  "admin.dashboard",
  "citizen.dashboard",
  "departmentHead.dashboard",
]);

function scopedKey(key) {
  if (!key) return key;
  if (!activeUserId) return key;
  return `${activeUserId}:${key}`;
}

function persistentStorageKey(userId, key) {
  return `pageCache:${userId}:${key}`;
}

async function persistCacheEntry(userId, key, value) {
  if (!userId || !PERSISTENT_CACHE_KEYS.has(key)) return;

  try {
    await AsyncStorage.setItem(
      persistentStorageKey(userId, key),
      JSON.stringify(value)
    );
  } catch (error) {
    console.log("Persist page cache error:", error);
  }
}

async function readPersistentCacheEntry(userId, key) {
  if (!userId || !PERSISTENT_CACHE_KEYS.has(key)) return null;

  try {
    const raw = await AsyncStorage.getItem(persistentStorageKey(userId, key));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.log("Read persisted page cache error:", error);
    return null;
  }
}

async function clearPersistentCacheForUser(userId) {
  if (!userId) return;

  await Promise.all(
    Array.from(PERSISTENT_CACHE_KEYS).map(async (key) => {
      try {
        await AsyncStorage.removeItem(persistentStorageKey(userId, key));
      } catch {
        // Ignore storage cleanup errors.
      }
    })
  );
}

export function setPageCacheUser(userId) {
  const nextId = userId || null;

  if (activeUserId && nextId && activeUserId !== nextId) {
    pageCache.clear();
  }

  if (!nextId) {
    pageCache.clear();
  }

  activeUserId = nextId;
}

export async function hydratePageCache(userId = activeUserId) {
  if (!userId) return;

  if (hydratePromise && activeUserId === userId) {
    return hydratePromise;
  }

  setPageCacheUser(userId);

  hydratePromise = (async () => {
    await Promise.all(
      Array.from(PERSISTENT_CACHE_KEYS).map(async (key) => {
        const scoped = scopedKey(key);
        const existing = pageCache.get(scoped);
        // Keep fresher in-memory counts; only fill from disk when missing.
        if (existing?.counts) return;

        const stored = await readPersistentCacheEntry(userId, key);
        if (stored) {
          pageCache.set(
            scoped,
            existing ? { ...stored, ...existing } : stored
          );
        }
      })
    );
  })();

  try {
    await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

export function getPageCache(key) {
  if (!key) return null;
  return pageCache.get(scopedKey(key)) ?? pageCache.get(key) ?? null;
}

export function setPageCache(key, value) {
  if (!key) return;

  const scoped = scopedKey(key);
  const previous = pageCache.get(scoped) || pageCache.get(key) || null;
  const nextValue =
    previous && value && typeof value === "object" && !Array.isArray(value)
      ? { ...previous, ...value }
      : value;

  pageCache.set(scoped, nextValue);

  const persistUserId =
    activeUserId ||
    (nextValue && typeof nextValue === "object"
      ? nextValue.currentUserId || null
      : null);

  if (persistUserId && PERSISTENT_CACHE_KEYS.has(key)) {
    void persistCacheEntry(persistUserId, key, nextValue);
  }
}

/** Apply persisted dashboard counts as soon as disk hydrate finishes. */
export async function ensureDashboardCacheHydrated(userId, cacheKey) {
  if (!userId || !cacheKey) {
    return getPageCache(cacheKey);
  }

  await hydratePageCache(userId);
  return getPageCache(cacheKey);
}

export function hasPageCache(key) {
  if (!key) return false;
  return pageCache.has(scopedKey(key)) || pageCache.has(key);
}

export function shouldShowPageLoader(key, hasVisibleData = false) {
  if (hasVisibleData) return false;
  // Dashboard shells (e.g. avatar-only) must not suppress the loader or
  // hide the need to restore counts — otherwise cards flash 0 on reopen.
  if (PERSISTENT_CACHE_KEYS.has(key)) {
    return !getPageCache(key)?.counts;
  }
  return !hasPageCache(key);
}

export async function clearPageCache() {
  const userId = activeUserId;

  pageCache.clear();
  activeUserId = null;
  resetNavigationPersistenceSession();
  resetProfileAvatarSession();
  clearProfileAvatar();
  clearCitizenProfileCache();
  clearComplaintPhotoCache();

  if (userId) {
    await clearPersistentCacheForUser(userId);
    await clearLastRoutesForUser(userId);
  }
}

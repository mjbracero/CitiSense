import { supabase } from "./supabase";

const AVATAR_BUCKET = "avatars";

/** @type {Map<string, object>} */
const profileCache = new Map();
/** @type {Map<string, string|null>} */
const resolvedAvatarCache = new Map();
/** @type {Map<string, Promise<string|null>>} */
const avatarResolveInFlight = new Map();

function extractAvatarPath(value) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const signMarker = `/storage/v1/object/sign/${AVATAR_BUCKET}/`;

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  if (!/^https?:\/\//i.test(text)) {
    return text.replace(/^avatars\//, "").replace(/^\/+/, "");
  }

  return null;
}

async function createReadableAvatarUrl(value) {
  if (!value) return null;

  const rawValue = String(value);

  if (resolvedAvatarCache.has(rawValue)) {
    return resolvedAvatarCache.get(rawValue);
  }

  if (avatarResolveInFlight.has(rawValue)) {
    return avatarResolveInFlight.get(rawValue);
  }

  const promise = (async () => {
    try {
      if (/^https?:\/\//i.test(rawValue)) {
        resolvedAvatarCache.set(rawValue, rawValue);
        return rawValue;
      }

      const path = extractAvatarPath(rawValue);
      if (!path) {
        resolvedAvatarCache.set(rawValue, null);
        return null;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, 60 * 60 * 24);

      if (!signedError && signedData?.signedUrl) {
        resolvedAvatarCache.set(rawValue, signedData.signedUrl);
        return signedData.signedUrl;
      }

      const { data: publicData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(path);

      const publicUrl = publicData?.publicUrl || null;
      resolvedAvatarCache.set(rawValue, publicUrl);
      return publicUrl;
    } catch (error) {
      console.log("Resolve avatar error:", error);
      return null;
    } finally {
      avatarResolveInFlight.delete(rawValue);
    }
  })();

  avatarResolveInFlight.set(rawValue, promise);
  return promise;
}

function normalizeProfile(profile, readableAvatarUrl) {
  return {
    id: profile.id,
    email: profile.email || "",
    full_name: profile.full_name || "Citizen",
    contact_number: profile.contact_number || "No contact number",
    avatar_url: readableAvatarUrl || null,
    rawAvatarUrl: profile.avatar_url || null,
  };
}

/**
 * Load citizen profiles once per session. Cached avatars are reused
 * so complaint lists do not re-sign storage URLs on every refresh.
 */
export async function loadCitizenProfiles(citizenIds = []) {
  const uniqueIds = Array.from(
    new Set((citizenIds || []).map(String).filter(Boolean))
  );

  if (uniqueIds.length === 0) {
    return {};
  }

  const missingIds = uniqueIds.filter((id) => !profileCache.has(id));

  if (missingIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,contact_number,avatar_url")
        .in("id", missingIds);

      if (error) {
        console.log("Load citizen profiles error:", error);
      } else {
        await Promise.all(
          (data || []).map(async (profile) => {
            const readableAvatarUrl = await createReadableAvatarUrl(
              profile.avatar_url
            );
            profileCache.set(
              String(profile.id),
              normalizeProfile(profile, readableAvatarUrl)
            );
          })
        );
      }
    } catch (error) {
      console.log("Load citizen profiles catch error:", error);
    }
  }

  const result = {};
  uniqueIds.forEach((id) => {
    const cached = profileCache.get(id);
    if (cached) {
      result[id] = cached;
    }
  });

  return result;
}

export async function loadCitizenProfile(citizenId) {
  if (!citizenId) return {};
  return loadCitizenProfiles([citizenId]);
}

export function getCachedCitizenProfile(citizenId) {
  if (!citizenId) return null;
  return profileCache.get(String(citizenId)) || null;
}

export function clearCitizenProfileCache() {
  profileCache.clear();
  resolvedAvatarCache.clear();
  avatarResolveInFlight.clear();
}

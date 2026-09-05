import { supabase } from "./supabase";
import {
  getProfileAvatarUrl,
  setProfileAvatarUrl,
} from "./profileAvatarStore";

const AVATAR_BUCKET = "avatars";

let loadPromise = null;
let loadAttempted = false;

function extractAvatarPath(value) {
  const text = String(value || "").trim();
  if (!text) return null;

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
  try {
    const rawValue = String(value || "").trim();
    if (!rawValue) return null;

    if (/^https?:\/\//i.test(rawValue)) {
      return rawValue;
    }

    const path = extractAvatarPath(rawValue);
    if (!path) return null;

    const { data: signedData } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    const { data: publicData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);

    return publicData?.publicUrl || null;
  } catch (error) {
    console.log("Resolve avatar error:", error);
    return null;
  }
}

async function fetchAvatarForRole(role) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  if (role === "admin") {
    const raw =
      user.user_metadata?.avatar_url || user.user_metadata?.avatar || null;

    if (!raw) {
      return null;
    }

    if (/^https?:\/\//i.test(String(raw))) {
      return String(raw);
    }

    return createReadableAvatarUrl(raw);
  }

  if (role === "citizen") {
    const metadataAvatar = user.user_metadata?.avatar_url || null;
    if (metadataAvatar) {
      return metadataAvatar;
    }

    const { data: profileData } = await supabase
      .from("citizen_profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    return profileData?.avatar_url || null;
  }

  if (role === "departmentHead") {
    const metadataAvatar = user.user_metadata?.avatar_url || null;
    if (metadataAvatar) {
      return metadataAvatar;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    const raw = profileData?.avatar_url || null;
    if (!raw) {
      return null;
    }

    if (/^https?:\/\//i.test(String(raw))) {
      return String(raw);
    }

    return createReadableAvatarUrl(raw);
  }

  return null;
}

/**
 * Load the signed-in user's avatar once per session.
 * Skips network when the in-memory store already has a URL.
 */
export async function ensureProfileAvatarLoaded(role) {
  const cached = getProfileAvatarUrl();
  if (cached) {
    return cached;
  }

  if (loadAttempted) {
    return null;
  }

  if (!loadPromise) {
    loadAttempted = true;
    loadPromise = fetchAvatarForRole(role)
      .then((url) => {
        if (url) {
          setProfileAvatarUrl(url);
        }
        return url;
      })
      .catch(() => null);
  }

  return loadPromise;
}

export function resetProfileAvatarSession() {
  loadPromise = null;
  loadAttempted = false;
}

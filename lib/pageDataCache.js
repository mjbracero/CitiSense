import { clearProfileAvatar } from "./profileAvatarStore";

const pageCache = new Map();
let activeUserId = null;

function scopedKey(key) {
  if (!key) return key;
  if (!activeUserId) return key;
  return `${activeUserId}:${key}`;
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

export function getPageCache(key) {
  if (!key) return null;
  return pageCache.get(scopedKey(key)) ?? pageCache.get(key) ?? null;
}

export function setPageCache(key, value) {
  if (!key) return;
  pageCache.set(scopedKey(key), value);
}

export function hasPageCache(key) {
  if (!key) return false;
  return pageCache.has(scopedKey(key)) || pageCache.has(key);
}

export function shouldShowPageLoader(key, hasVisibleData = false) {
  if (hasVisibleData) return false;
  return !hasPageCache(key);
}

export function clearPageCache() {
  pageCache.clear();
  activeUserId = null;
  clearProfileAvatar();
}

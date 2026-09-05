import AsyncStorage from "@react-native-async-storage/async-storage";
import { resetProfileAvatarSession } from "./profileAvatarService";
import { clearProfileAvatar } from "./profileAvatarStore";
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
        if (pageCache.has(scoped)) return;

        const stored = await readPersistentCacheEntry(userId, key);
        if (stored) {
          pageCache.set(scoped, stored);
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
  pageCache.set(scopedKey(key), value);

  if (activeUserId && PERSISTENT_CACHE_KEYS.has(key)) {
    void persistCacheEntry(activeUserId, key, value);
  }
}

export function hasPageCache(key) {
  if (!key) return false;
  return pageCache.has(scopedKey(key)) || pageCache.has(key);
}

export function shouldShowPageLoader(key, hasVisibleData = false) {
  if (hasVisibleData) return false;
  return !hasPageCache(key);
}

export async function clearPageCache() {
  const userId = activeUserId;

  pageCache.clear();
  activeUserId = null;
  resetNavigationPersistenceSession();
  resetProfileAvatarSession();
  clearProfileAvatar();

  if (userId) {
    await clearPersistentCacheForUser(userId);
    await clearLastRoutesForUser(userId);
  }
}

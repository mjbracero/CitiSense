import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

const ROLE_ROUTE_PREFIX = {
  admin: "/admin/",
  citizen: "/citizen/",
  departmentHead: "/departmentHead/",
};

const ROLE_ALLOWED_ROUTES = {
  admin: [
    "/admin/dashboard",
    "/admin/complaints",
    "/admin/analytics",
    "/admin/notification",
    "/admin/profile",
  ],
  citizen: [
    "/citizen/dashboard",
    "/citizen/submit",
    "/citizen/complaints",
    "/citizen/notification",
    "/citizen/profile",
  ],
  departmentHead: [
    "/departmentHead/dashboard",
    "/departmentHead/assignedComplaints",
    "/departmentHead/notification",
    "/departmentHead/profile",
  ],
};

const ROLE_HOME_ROUTES = {
  admin: "/admin/dashboard",
  citizen: "/citizen/dashboard",
  departmentHead: "/departmentHead/dashboard",
};

const MEDIA_PICKER_SESSION_KEY = "nav:mediaPickerSession";
const MEDIA_PICKER_SESSION_MAX_MS = 15 * 60 * 1000;
/**
 * Only treat a real app leave as "reopen". Short inactive blips (keyboard,
 * permission sheets, quick app switcher peeks) must not yank tabs back home.
 */
const MIN_BACKGROUND_MS_FOR_HOME = 2500;
/** Keep picker protection until AppState has settled after camera/gallery. */
const MEDIA_PICKER_CLEAR_DELAY_MS = 3500;

let coldStartRouteRestoreDone = false;
let lastBackgroundAt = 0;
let backgroundWatcherAttached = false;
let mediaPickerSessionMemory = null;
let activeReopenContext = null;
let homeNudgeTimers = [];
let mediaPickerClearTimer = null;

function clearHomeNudgeTimers() {
  homeNudgeTimers.forEach((timer) => clearTimeout(timer));
  homeNudgeTimers = [];
}

function lastRouteStorageKey(userId, role) {
  return `lastRoute:${userId}:${role}`;
}

export function getHomeRouteForRoleKey(role) {
  return ROLE_HOME_ROUTES[role] || null;
}

export function normalizeAppRoute(pathname = "") {
  const text = String(pathname || "").trim();
  if (!text) return null;

  if (text.startsWith("/")) {
    return text.split("?")[0];
  }

  return `/${text.split("?")[0]}`;
}

export function isValidRouteForRole(route, role) {
  const normalized = normalizeAppRoute(route);
  if (!normalized || !role) return false;

  const allowed = ROLE_ALLOWED_ROUTES[role] || [];
  return allowed.includes(normalized);
}

export function isRouteInRole(pathname, role) {
  const normalized = normalizeAppRoute(pathname);
  const prefix = ROLE_ROUTE_PREFIX[role];
  return Boolean(normalized && prefix && normalized.startsWith(prefix));
}

export async function saveLastRoute(userId, role, pathname) {
  if (!userId || !role) return;

  const route = normalizeAppRoute(pathname);
  if (!route || !isValidRouteForRole(route, role)) return;

  try {
    await AsyncStorage.setItem(lastRouteStorageKey(userId, role), route);
  } catch (error) {
    console.log("Save last route error:", error);
  }
}

export async function getLastRoute(userId, role) {
  if (!userId || !role) return null;

  try {
    const stored = await AsyncStorage.getItem(lastRouteStorageKey(userId, role));
    const route = normalizeAppRoute(stored);

    if (route && isValidRouteForRole(route, role)) {
      return route;
    }
  } catch (error) {
    console.log("Read last route error:", error);
  }

  return null;
}

export async function clearLastRoute(userId, role) {
  if (!userId || !role) return;

  try {
    await AsyncStorage.removeItem(lastRouteStorageKey(userId, role));
  } catch (error) {
    console.log("Clear last route error:", error);
  }
}

function readMediaPickerSessionFromMemory(role = null) {
  const route = normalizeAppRoute(mediaPickerSessionMemory?.route);
  const at = Number(mediaPickerSessionMemory?.at) || 0;

  if (!route || !at || Date.now() - at > MEDIA_PICKER_SESSION_MAX_MS) {
    mediaPickerSessionMemory = null;
    return null;
  }

  if (role && !isValidRouteForRole(route, role)) {
    return null;
  }

  return route;
}

function cancelScheduledMediaPickerClear() {
  if (mediaPickerClearTimer) {
    clearTimeout(mediaPickerClearTimer);
    mediaPickerClearTimer = null;
  }
}

export async function markMediaPickerSession(pathname) {
  const route = normalizeAppRoute(pathname);
  if (!route) return;

  cancelScheduledMediaPickerClear();
  mediaPickerSessionMemory = { route, at: Date.now() };

  try {
    await AsyncStorage.setItem(
      MEDIA_PICKER_SESSION_KEY,
      JSON.stringify(mediaPickerSessionMemory)
    );
  } catch (error) {
    console.log("Mark media picker session error:", error);
  }
}

export async function peekMediaPickerReturnRoute(role = null) {
  const memoryRoute = readMediaPickerSessionFromMemory(role);
  if (memoryRoute) return memoryRoute;

  try {
    const raw = await AsyncStorage.getItem(MEDIA_PICKER_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    mediaPickerSessionMemory = {
      route: normalizeAppRoute(parsed?.route),
      at: Number(parsed?.at) || 0,
    };

    return readMediaPickerSessionFromMemory(role);
  } catch (error) {
    console.log("Peek media picker session error:", error);
    return null;
  }
}

export async function clearMediaPickerSession() {
  cancelScheduledMediaPickerClear();
  mediaPickerSessionMemory = null;

  try {
    await AsyncStorage.removeItem(MEDIA_PICKER_SESSION_KEY);
  } catch (error) {
    console.log("Clear media picker session error:", error);
  }
}

/**
 * Clear after AppState has settled so reopen→home cannot race the gallery return.
 */
export function scheduleClearMediaPickerSession(
  delayMs = MEDIA_PICKER_CLEAR_DELAY_MS
) {
  cancelScheduledMediaPickerClear();
  mediaPickerClearTimer = setTimeout(() => {
    mediaPickerClearTimer = null;
    void clearMediaPickerSession();
  }, delayMs);
}

export async function resolveStartupRoute(_userId, role, defaultRoute) {
  const pickerRoute = await peekMediaPickerReturnRoute(role);
  if (pickerRoute) return pickerRoute;
  return getHomeRouteForRoleKey(role) || defaultRoute;
}

function nudgeRoute(router, route) {
  if (!router || !route) return;

  try {
    router.replace(route);
  } catch (error) {
    console.log("Route replace error:", error);
  }
}

function goHomeNow(router, role, userId = null) {
  const homeRoute = getHomeRouteForRoleKey(role);
  if (!homeRoute) return null;

  clearHomeNudgeTimers();
  nudgeRoute(router, homeRoute);

  if (userId) {
    void saveLastRoute(userId, role, homeRoute);
  }

  return homeRoute;
}

/**
 * One-time cold-start redirect to home (or media-picker return screen).
 */
export async function restoreLastRouteOnce(router, role, userId, currentPathname) {
  if (coldStartRouteRestoreDone || !router || !role) {
    return getHomeRouteForRoleKey(role);
  }

  await peekMediaPickerReturnRoute(role);
  const pickerRoute = readMediaPickerSessionFromMemory(role);
  const homeRoute = getHomeRouteForRoleKey(role);
  const targetRoute = pickerRoute || homeRoute;

  if (!targetRoute) {
    coldStartRouteRestoreDone = true;
    return null;
  }

  coldStartRouteRestoreDone = true;

  const currentRoute = normalizeAppRoute(currentPathname);
  if (currentRoute !== targetRoute) {
    nudgeRoute(router, targetRoute);
  }

  if (pickerRoute) {
    scheduleClearMediaPickerSession(MEDIA_PICKER_CLEAR_DELAY_MS);
  } else if (homeRoute && userId) {
    void saveLastRoute(userId, role, homeRoute);
  }

  return targetRoute;
}

/**
 * Real app reopen → dashboard.
 * Does not fight normal tab navigation while the app stays active.
 * Never navigates away while backgrounded (camera/gallery/permissions).
 */
export function ensureHomeOnAppReopen(router, role, getPathname, getUserId) {
  if (!router || !role) {
    return () => {};
  }

  activeReopenContext = { router, role, getPathname, getUserId };

  if (!backgroundWatcherAttached) {
    backgroundWatcherAttached = true;

    AppState.addEventListener("change", (nextState) => {
      const ctx = activeReopenContext;
      if (!ctx?.router || !ctx?.role) return;

      if (nextState === "background") {
        lastBackgroundAt = Date.now();
        // Do NOT replace to home while hidden. Gallery/camera/permission
        // sheets background the app; navigating away drops Submit mid-flow.
        return;
      }

      if (nextState !== "active") {
        return;
      }

      if (!lastBackgroundAt) return;

      const awayMs = Date.now() - lastBackgroundAt;
      lastBackgroundAt = 0;

      if (awayMs < MIN_BACKGROUND_MS_FOR_HOME) {
        return;
      }

      void (async () => {
        const latestCtx = activeReopenContext;
        if (!latestCtx?.router || latestCtx.role !== ctx.role) return;

        const pickerRoute = await peekMediaPickerReturnRoute(latestCtx.role);
        if (pickerRoute) {
          const currentRoute = normalizeAppRoute(
            typeof latestCtx.getPathname === "function"
              ? latestCtx.getPathname()
              : latestCtx.getPathname
          );
          if (currentRoute !== pickerRoute) {
            nudgeRoute(latestCtx.router, pickerRoute);
          }
          return;
        }

        goHomeNow(
          latestCtx.router,
          latestCtx.role,
          typeof latestCtx.getUserId === "function"
            ? latestCtx.getUserId()
            : null
        );
      })();
    });
  }

  return () => {
    if (
      activeReopenContext?.router === router &&
      activeReopenContext?.role === role
    ) {
      activeReopenContext = null;
    }
  };
}

export async function clearLastRoutesForUser(userId) {
  if (!userId) return;

  await Promise.all(
    Object.keys(ROLE_ALLOWED_ROUTES).map((role) =>
      clearLastRoute(userId, role)
    )
  );
}

export function resetNavigationPersistenceSession() {
  coldStartRouteRestoreDone = false;
  lastBackgroundAt = 0;
  clearHomeNudgeTimers();
  cancelScheduledMediaPickerClear();
}

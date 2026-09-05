import AsyncStorage from "@react-native-async-storage/async-storage";

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
    "/citizen/profile",
  ],
  departmentHead: [
    "/departmentHead/dashboard",
    "/departmentHead/assignedComplaints",
    "/departmentHead/notification",
    "/departmentHead/profile",
  ],
};

let coldStartRouteRestoreDone = false;

function lastRouteStorageKey(userId, role) {
  return `lastRoute:${userId}:${role}`;
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

export async function resolveStartupRoute(userId, role, defaultRoute) {
  const lastRoute = await getLastRoute(userId, role);
  if (lastRoute) {
    return lastRoute;
  }

  return defaultRoute;
}

/**
 * On cold start, Expo may restore a stale screen. Reconcile with the last saved tab route once.
 */
export async function restoreLastRouteOnce(router, role, userId, currentPathname) {
  if (coldStartRouteRestoreDone || !router || !userId || !role) {
    return;
  }

  coldStartRouteRestoreDone = true;

  const lastRoute = await getLastRoute(userId, role);
  if (!lastRoute) return;

  const currentRoute = normalizeAppRoute(currentPathname);
  if (!currentRoute || currentRoute === lastRoute) return;

  router.replace(lastRoute);
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
}

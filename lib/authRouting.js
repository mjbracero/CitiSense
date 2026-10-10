import { supabase } from "./supabase";
import { clearPageCache, hydratePageCache, setPageCacheUser } from "./pageDataCache";
import { registerPushTokenForCurrentUser } from "./pushNotifications";
import {
  hydratePasswordRecoveryFlag,
  isPasswordRecoveryActive,
} from "./passwordReset";
import { peekMediaPickerReturnRoute } from "./navigationPersistence";

export function getHomeRouteForRole(role) {
  if (role === "citizen") {
    return "/citizen/dashboard";
  }

  if (role === "moderator" || role === "departmentHead") {
    return "/departmentHead/dashboard";
  }

  if (role === "admin") {
    return "/admin/dashboard";
  }

  return "/auth/login";
}

function persistenceRoleKey(role) {
  if (role === "citizen") return "citizen";
  if (role === "admin") return "admin";
  if (role === "moderator" || role === "departmentHead") return "departmentHead";
  return null;
}

export async function resolveAuthenticatedHomeRoute({
  registerPush = true,
} = {}) {
  await hydratePasswordRecoveryFlag();

  if (isPasswordRecoveryActive()) {
    return "/auth/resetPassword";
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    return "/auth/login";
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, banned_at")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile?.role) {
    await supabase.auth.signOut();
    await clearPageCache();
    return "/auth/login";
  }

  if (profile.banned_at) {
    await supabase.auth.signOut();
    await clearPageCache();
    return "/auth/login";
  }

  setPageCacheUser(profile.id);
  await hydratePageCache(profile.id);

  const homeRoute = getHomeRouteForRole(profile.role);

  if (homeRoute === "/auth/login") {
    return homeRoute;
  }

  if (registerPush) {
    try {
      await registerPushTokenForCurrentUser();
    } catch (error) {
      console.log("Push token registration on session restore:", error);
    }
  }

  const roleKey = persistenceRoleKey(profile.role);
  const pickerRoute = roleKey
    ? await peekMediaPickerReturnRoute(roleKey)
    : null;

  // Android may recreate the app while the camera/gallery is open.
  // Return to that screen instead of the dashboard.
  if (pickerRoute) {
    return pickerRoute;
  }

  return homeRoute;
}

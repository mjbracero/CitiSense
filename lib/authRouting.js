import { supabase } from "./supabase";
import { registerPushTokenForCurrentUser } from "./pushNotifications";
import {
  hydratePasswordRecoveryFlag,
  isPasswordRecoveryActive,
} from "./passwordReset";

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
    .select("id, role")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile?.role) {
    await supabase.auth.signOut();
    return "/auth/login";
  }

  const route = getHomeRouteForRole(profile.role);

  if (route === "/auth/login") {
    return route;
  }

  if (registerPush) {
    try {
      await registerPushTokenForCurrentUser();
    } catch (error) {
      console.log("Push token registration on session restore:", error);
    }
  }

  return route;
}

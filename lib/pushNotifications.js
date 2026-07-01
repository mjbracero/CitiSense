import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

function pushPreferenceKey(userId) {
  return `push_enabled_${userId}`;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedDeviceToken = null;

function normalizeToken(value) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "CitiSense Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#087A0D",
  });
}

export async function requestPushPermissions() {
  if (!Device.isDevice) {
    return false;
  }

  const settings = await Notifications.getPermissionsAsync();
  let finalStatus = settings.status;

  if (finalStatus !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  return finalStatus === "granted";
}

export async function getDevicePushToken() {
  if (!Device.isDevice) {
    return null;
  }

  const hasPermission = await requestPushPermissions();

  if (!hasPermission) {
    return null;
  }

  await ensureAndroidNotificationChannel();

  const tokenResult = await Notifications.getDevicePushTokenAsync();
  const token = normalizeToken(tokenResult?.data);

  if (!token) {
    return null;
  }

  cachedDeviceToken = token;

  return {
    token,
    platform: Platform.OS,
  };
}

export async function upsertPushToken(userId, tokenInfo, { isActive } = {}) {
  if (!userId || !tokenInfo?.token) {
    return { error: new Error("Missing user or push token.") };
  }

  const active =
    typeof isActive === "boolean" ? isActive : await loadPushEnabled(userId);

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token: tokenInfo.token,
      platform: tokenInfo.platform,
      is_active: active,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,token" }
  );

  return { error };
}

export async function registerDevicePushToken(userId) {
  try {
    const pushEnabled = await loadPushEnabled(userId);

    if (!pushEnabled) {
      return { registered: false, disabled: true };
    }

    const tokenInfo = await getDevicePushToken();

    if (!tokenInfo) {
      return { registered: false };
    }

    const { error } = await upsertPushToken(userId, tokenInfo, {
      isActive: true,
    });

    if (error) {
      console.log("Push token upsert error:", error);
      return { registered: false, error };
    }

    return { registered: true, token: tokenInfo.token };
  } catch (error) {
    console.log("Register push token error:", error);
    return { registered: false, error };
  }
}

export async function registerPushTokenForCurrentUser() {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log("No logged-in user. Push token not saved.");
      return { registered: false };
    }

    return registerDevicePushToken(user.id);
  } catch (error) {
    console.log("Register push token for current user error:", error);
    return { registered: false, error };
  }
}

export async function loadPushEnabled(userId) {
  if (!userId) {
    return true;
  }

  try {
    const stored = await AsyncStorage.getItem(pushPreferenceKey(userId));

    if (stored === "false") {
      return false;
    }
  } catch {
    // Fall back to database preference.
  }

  const { data, error } = await supabase
    .from("push_tokens")
    .select("is_active")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || data == null) {
    return true;
  }

  return data.is_active !== false;
}

export async function updatePushEnabled(userId, enabled) {
  if (!userId) {
    return { error: new Error("Missing user id.") };
  }

  try {
    await AsyncStorage.setItem(
      pushPreferenceKey(userId),
      enabled ? "true" : "false"
    );
  } catch {
    // Continue updating database preference.
  }

  const { error } = await supabase
    .from("push_tokens")
    .update({
      is_active: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { error };
}

export async function removePushTokensForUser(userId) {
  if (!userId) {
    return;
  }

  if (cachedDeviceToken) {
    await supabase
      .from("push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", cachedDeviceToken);

    cachedDeviceToken = null;
    return;
  }

  await supabase.from("push_tokens").delete().eq("user_id", userId);
}

export function setupNotificationListeners({
  onNotificationReceived,
  onNotificationResponse,
} = {}) {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      onNotificationReceived?.(notification);
    }
  );

  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      onNotificationResponse?.(response);
    });

  return {
    receivedSubscription,
    responseSubscription,
  };
}

export function removeNotificationListeners(subscriptions) {
  subscriptions?.receivedSubscription?.remove();
  subscriptions?.responseSubscription?.remove();
}

export function getNotificationRouteFromResponse(response) {
  const data = response?.notification?.request?.content?.data || {};

  if (typeof data.route === "string" && data.route.length > 0) {
    return data.route;
  }

  if (data.role === "admin") {
    return "/admin/notification";
  }

  if (data.role === "departmentHead") {
    return "/departmentHead/notification";
  }

  return "/citizen/notification";
}

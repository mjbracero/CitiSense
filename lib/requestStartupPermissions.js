import * as Location from "expo-location";
import {
  ensureAndroidNotificationChannel,
  requestPushPermissions,
} from "./pushNotifications";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask only for location and notification access on app open.
 * Microphone stays on the submit screen voice button (working flow).
 */
export async function requestStartupPermissions() {
  const results = {
    location: false,
    notifications: false,
  };

  try {
    const existingLocation = await Location.getForegroundPermissionsAsync();

    if (existingLocation.status === "granted") {
      results.location = true;
    } else {
      const requestedLocation =
        await Location.requestForegroundPermissionsAsync();
      results.location = requestedLocation.status === "granted";
    }
  } catch (error) {
    console.log("Startup location permission error:", error);
  }

  await wait(350);

  try {
    results.notifications = await requestPushPermissions();
    if (results.notifications) {
      await ensureAndroidNotificationChannel();
    }
  } catch (error) {
    console.log("Startup notification permission error:", error);
  }

  return results;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

function storageKey(userId) {
  return `location_enabled_${userId}`;
}

export async function loadLocationPreference(userId) {
  if (!userId) {
    return false;
  }

  try {
    const stored = await AsyncStorage.getItem(storageKey(userId));

    if (stored === "false") {
      return false;
    }

    const permission = await Location.getForegroundPermissionsAsync();
    return permission.status === "granted";
  } catch {
    return false;
  }
}

export async function saveLocationPreference(userId, enabled) {
  if (!userId) {
    return;
  }

  await AsyncStorage.setItem(storageKey(userId), enabled ? "true" : "false");
}

export async function isLocationUsageAllowed(userId) {
  if (!userId) {
    return false;
  }

  try {
    const stored = await AsyncStorage.getItem(storageKey(userId));

    if (stored === "false") {
      return false;
    }

    const permission = await Location.getForegroundPermissionsAsync();
    return permission.status === "granted";
  } catch {
    return false;
  }
}

import { Platform } from "react-native";

export const APP_BACKGROUND = "#F7FAF6";

/** Bottom padding when the keyboard is open inside a React Native Modal. */
export function getModalKeyboardPadding(keyboardInset = 0, safeBottom = 0) {
  if (keyboardInset <= 0) {
    return 0;
  }

  if (Platform.OS === "ios") {
    return Math.max(keyboardInset - safeBottom, 0);
  }

  return Math.max(keyboardInset, 0);
}

export function getKeyboardAwarePadding(
  keyboardInset = 0,
  safeBottom = 0,
  { androidNeedsManualPadding = false } = {}
) {
  if (keyboardInset <= 0) {
    return 0;
  }

  if (Platform.OS === "ios") {
    return Math.max(keyboardInset - safeBottom, 0);
  }

  if (!androidNeedsManualPadding) {
    return 0;
  }

  return Math.max(keyboardInset, 0);
}

/** Bottom offset for absolutely positioned inputs above the keyboard. */
export function getKeyboardLift(
  keyboardInset = 0,
  gap = 0,
  safeBottom = 0,
  { androidNeedsManualPadding = true } = {}
) {
  if (keyboardInset <= 0) {
    return 0;
  }

  if (Platform.OS === "ios") {
    return Math.max(keyboardInset - safeBottom, 0) + gap;
  }

  if (androidNeedsManualPadding) {
    return keyboardInset + gap;
  }

  return gap;
}

export function getAndroidBlurFallbackColor(opacity = 0.94) {
  return `rgba(255,255,255,${opacity})`;
}

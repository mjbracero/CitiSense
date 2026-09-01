import { useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, Platform } from "react-native";

export const KEYBOARD_SCROLL_PROPS = {
  keyboardShouldPersistTaps: "handled",
  keyboardDismissMode: Platform.OS === "ios" ? "interactive" : "on-drag",
};

function resolveKeyboardHeight(event) {
  const end = event?.endCoordinates;

  if (!end) {
    return 0;
  }

  const reported = end.height || 0;
  const screenY = end.screenY;
  const windowHeight = Dimensions.get("window").height;

  if (typeof screenY === "number" && screenY > 0 && screenY < windowHeight) {
    return Math.max(windowHeight - screenY, reported);
  }

  return reported;
}

function readKeyboardMetrics() {
  const metrics = Keyboard.metrics?.();

  if (!metrics || metrics.height <= 0) {
    return 0;
  }

  const windowHeight = Dimensions.get("window").height;

  if (
    typeof metrics.screenY === "number" &&
    metrics.screenY > 0 &&
    metrics.screenY < windowHeight
  ) {
    return Math.max(windowHeight - metrics.screenY, metrics.height);
  }

  return metrics.height;
}

function didWindowShrinkForKeyboard(baselineHeight, keyboardHeight) {
  if (Platform.OS !== "android" || keyboardHeight <= 0) {
    return false;
  }

  const currentHeight = Dimensions.get("window").height;
  const shrinkAmount = baselineHeight - currentHeight;

  return shrinkAmount >= Math.max(keyboardHeight * 0.72, 120);
}

export function useKeyboardInset() {
  const baselineWindowHeightRef = useRef(Dimensions.get("window").height);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardDuration, setKeyboardDuration] = useState(250);
  const [androidNeedsManualPadding, setAndroidNeedsManualPadding] =
    useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleShow = (event) => {
      const nextHeight = resolveKeyboardHeight(event);
      const duration = Math.max(event?.duration ?? (Platform.OS === "ios" ? 250 : 220), 120);

      setKeyboardDuration(duration);

      if (Platform.OS === "android") {
        const needsManual = !didWindowShrinkForKeyboard(
          baselineWindowHeightRef.current,
          nextHeight
        );
        setAndroidNeedsManualPadding(needsManual && nextHeight > 0);
      }

      setKeyboardHeight(nextHeight);
    };

    const handleHide = (event) => {
      const duration = Math.max(event?.duration ?? (Platform.OS === "ios" ? 250 : 220), 120);

      setKeyboardDuration(duration);
      setKeyboardHeight(0);
      setAndroidNeedsManualPadding(false);
      baselineWindowHeightRef.current = Dimensions.get("window").height;
    };

    const subscriptions = [
      Keyboard.addListener(showEvent, handleShow),
      Keyboard.addListener(hideEvent, handleHide),
    ];

    if (Platform.OS === "android") {
      subscriptions.push(Keyboard.addListener("keyboardDidChangeFrame", handleShow));

      const initialHeight = readKeyboardMetrics();

      if (initialHeight > 0) {
        setAndroidNeedsManualPadding(
          !didWindowShrinkForKeyboard(
            baselineWindowHeightRef.current,
            initialHeight
          )
        );
        setKeyboardHeight(initialHeight);
      }
    }

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return {
    keyboardHeight,
    keyboardDuration,
    androidNeedsManualPadding,
  };
}

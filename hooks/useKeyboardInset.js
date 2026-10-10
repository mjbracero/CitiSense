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

  // Prefer the IME's own height. screenHeight - screenY overshoots on
  // edge-to-edge Android (nav bar / insets) and leaves a huge gap above keys.
  if (reported > 0) {
    return reported;
  }

  const screenY = end.screenY;
  const screenHeight = Dimensions.get("screen").height;

  if (typeof screenY === "number" && screenY > 0 && screenY < screenHeight) {
    const fromScreen = screenHeight - screenY;
    if (fromScreen > 0) {
      return fromScreen;
    }
  }

  return 0;
}

function readKeyboardMetrics() {
  const metrics = Keyboard.metrics?.();

  if (!metrics || metrics.height <= 0) {
    return 0;
  }

  // Same as resolveKeyboardHeight — trust metrics.height first.
  return metrics.height;
}

function didWindowShrinkForKeyboard(baselineHeight) {
  if (Platform.OS !== "android") {
    return false;
  }

  const currentHeight = Dimensions.get("window").height;
  const shrinkAmount = baselineHeight - currentHeight;

  // adjustResize / softwareKeyboardLayoutMode "resize" shrinks the window.
  // Use a low absolute threshold — tying this to reported keyboard height
  // (often screenY-based and inflated) falsely enabled manual padding and
  // stacked a second full keyboard gap on top of the resize.
  return shrinkAmount >= 80;
}

export function useKeyboardInset() {
  const baselineWindowHeightRef = useRef(Dimensions.get("window").height);
  const keyboardHeightRef = useRef(0);
  const settleTimerRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardDuration, setKeyboardDuration] = useState(250);
  const [androidNeedsManualPadding, setAndroidNeedsManualPadding] =
    useState(false);

  useEffect(() => {
    const clearSettleTimer = () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const handleShow = (event) => {
      const nextHeight = resolveKeyboardHeight(event);
      const duration = Math.max(
        event?.duration ?? (Platform.OS === "ios" ? 250 : 220),
        120
      );

      keyboardHeightRef.current = nextHeight;
      setKeyboardDuration(duration);
      setKeyboardHeight(nextHeight);

      if (Platform.OS !== "android") {
        return;
      }

      // Assume resize will clear the keyboard first (no big lift). After the
      // window settles, only enable manual padding if resize did not happen.
      // This prevents the submit page up-then-down jump.
      setAndroidNeedsManualPadding(false);
      clearSettleTimer();
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        if (keyboardHeightRef.current <= 0) return;

        const needsManual = !didWindowShrinkForKeyboard(
          baselineWindowHeightRef.current
        );
        setAndroidNeedsManualPadding(
          needsManual && keyboardHeightRef.current > 0
        );
      }, 100);
    };

    const handleHide = (event) => {
      const duration = Math.max(
        event?.duration ?? (Platform.OS === "ios" ? 250 : 220),
        120
      );

      clearSettleTimer();
      keyboardHeightRef.current = 0;
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
      // Intentionally do NOT listen to keyboardDidChangeFrame — intermediate
      // frame heights make docks jump up then settle down on focus.
      const initialHeight = readKeyboardMetrics();

      if (initialHeight > 0) {
        keyboardHeightRef.current = initialHeight;
        setKeyboardHeight(initialHeight);
        setAndroidNeedsManualPadding(
          !didWindowShrinkForKeyboard(baselineWindowHeightRef.current)
        );
      }
    }

    return () => {
      clearSettleTimer();
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return {
    keyboardHeight,
    keyboardDuration,
    androidNeedsManualPadding,
  };
}

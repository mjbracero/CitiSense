import { useEffect, useMemo } from "react";
import { Platform, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { getModalKeyboardPadding } from "../lib/platformUi";

const IOS_KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.99);

/**
 * Bottom sheet inside a Modal — lifts smoothly with the keyboard.
 * Uses an animated spacer (not transform on the scroll parent) to avoid
 * Fabric crashes when KeyboardAwareScrollView unmounts inside Animated.View.
 */
export default function KeyboardAwareSheet({ children, style }) {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, keyboardDuration } = useKeyboardInset();
  const lift = useSharedValue(0);

  const targetLift = useMemo(() => {
    const keyboardPadding = getModalKeyboardPadding(
      keyboardHeight,
      insets.bottom
    );

    return keyboardPadding > 0 ? keyboardPadding + 12 : 0;
  }, [keyboardHeight, insets.bottom]);

  useEffect(() => {
    lift.value = withTiming(targetLift, {
      duration: keyboardDuration,
      easing:
        Platform.OS === "ios" ? IOS_KEYBOARD_EASING : Easing.out(Easing.cubic),
    });
  }, [targetLift, keyboardDuration, lift]);

  const spacerStyle = useAnimatedStyle(() => ({
    height: lift.value,
  }));

  return (
    <View style={style}>
      {children}
      <Animated.View pointerEvents="none" style={spacerStyle} />
    </View>
  );
}

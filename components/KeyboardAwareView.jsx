import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { getKeyboardAwarePadding } from "../lib/platformUi";

/** Layout shell with keyboard avoidance for full screens. */
export default function KeyboardAwareView({ children, style, offset = 0 }) {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, androidNeedsManualPadding } = useKeyboardInset();
  const keyboardOpen = keyboardHeight > 0;

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView
        style={[{ flex: 1 }, style]}
        behavior={keyboardOpen ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + offset}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }

  const paddingBottom = getKeyboardAwarePadding(
    keyboardHeight,
    insets.bottom,
    { androidNeedsManualPadding }
  );

  return (
    <View style={[{ flex: 1, paddingBottom }, style]}>{children}</View>
  );
}

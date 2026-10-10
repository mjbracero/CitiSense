import { isKeyboardControllerLinked } from "../lib/keyboardController";

// ===== [KEYBOARD PROVIDER] Optional react-native-keyboard-controller provider wrapper =====
const LinkedKeyboardProvider = isKeyboardControllerLinked()
  ? require("react-native-keyboard-controller").KeyboardProvider
  : null;

/** Pass-through when the native module isn't in this binary yet. */
export default function AppKeyboardProvider({ children, ...props }) {
  if (!LinkedKeyboardProvider) {
    return children;
  }

  return (
    <LinkedKeyboardProvider
      statusBarTranslucent
      navigationBarTranslucent
      {...props}
    >
      {children}
    </LinkedKeyboardProvider>
  );
}

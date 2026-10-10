import { TurboModuleRegistry } from "react-native";

export function isKeyboardControllerLinked() {
  try {
    return TurboModuleRegistry.get("KeyboardController") != null;
  } catch {
    return false;
  }
}

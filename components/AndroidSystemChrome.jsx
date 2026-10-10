import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform } from "react-native";

// ===== [SYSTEM CHROME] Sets Android system UI background color (renders nothing) =====
export default function AndroidSystemChrome() {
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    SystemUI.setBackgroundColorAsync("rgba(247, 250, 246, 1)").catch(() => {});
  }, []);

  return null;
}

import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { Platform } from "react-native";
import { APP_BACKGROUND } from "../lib/platformUi";

export default function AndroidSystemChrome() {
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    SystemUI.setBackgroundColorAsync(APP_BACKGROUND).catch(() => {});
  }, []);

  return null;
}

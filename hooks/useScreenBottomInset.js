import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BOTTOM_NAV_CONTENT_INSET } from "../components/PersistentBottomNav";

export function useScreenBottomInset({ includeNav = true, minimum = 24 } = {}) {
  const insets = useSafeAreaInsets();

  if (includeNav) {
    return BOTTOM_NAV_CONTENT_INSET;
  }

  return Math.max(insets.bottom, minimum);
}

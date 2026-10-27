import { Platform, StyleSheet } from "react-native";
import { KeyboardAwareScrollView as RNKeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KEYBOARD_SCROLL_PROPS,
  useKeyboardInset,
} from "../hooks/useKeyboardInset";
import { getKeyboardAwarePadding, getModalKeyboardPadding } from "../lib/platformUi";

export { KEYBOARD_SCROLL_PROPS };

function toInnerRefCallback(innerRef) {
  if (!innerRef) return undefined;
  if (typeof innerRef === "function") return innerRef;
  if (typeof innerRef === "object" && "current" in innerRef) {
    return (node) => {
      innerRef.current = node;
    };
  }
  return undefined;
}

export default function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  modal = false,
  suppressContentPadding = false,
  smoothKeyboard = false,
  enableOnAndroid = true,
  enableAutomaticScroll = true,
  enableResetScrollToCoords = false,
  extraScrollHeight = Platform.OS === "ios" ? 32 : 120,
  extraHeight = Platform.OS === "android" ? 140 : 0,
  keyboardOpeningTime = 0,
  keyboardVerticalOffset,
  keyboardShouldPersistTaps = KEYBOARD_SCROLL_PROPS.keyboardShouldPersistTaps,
  keyboardDismissMode = KEYBOARD_SCROLL_PROPS.keyboardDismissMode,
  innerRef,
  ref: forwardedRef,
  ...props
}) {
  const insets = useSafeAreaInsets();
  const { keyboardHeight, androidNeedsManualPadding, keyboardDuration } =
    useKeyboardInset();

  const keyboardPadding = modal
    ? getModalKeyboardPadding(keyboardHeight, insets.bottom)
    : getKeyboardAwarePadding(keyboardHeight, insets.bottom, {
        androidNeedsManualPadding,
      });

  const resolvedInnerRef = toInnerRefCallback(innerRef ?? forwardedRef);
  const resolvedKeyboardOpeningTime = smoothKeyboard
    ? Math.max(keyboardDuration, 120)
    : keyboardOpeningTime;

  return (
    <RNKeyboardAwareScrollView
      {...props}
      style={[modal ? styles.modalRoot : styles.flex, style]}
      contentContainerStyle={[
        contentContainerStyle,
        !suppressContentPadding &&
          keyboardPadding > 0 && {
            paddingBottom: keyboardPadding + (modal ? 8 : 24),
          },
      ]}
      enableOnAndroid={enableOnAndroid}
      enableAutomaticScroll={enableAutomaticScroll}
      enableResetScrollToCoords={enableResetScrollToCoords}
      extraScrollHeight={extraScrollHeight}
      extraHeight={extraHeight}
      keyboardOpeningTime={resolvedKeyboardOpeningTime}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      keyboardVerticalOffset={
        keyboardVerticalOffset ?? (Platform.OS === "ios" ? insets.top : 0)
      }
      innerRef={resolvedInnerRef}
    >
      {children}
    </RNKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  modalRoot: {
    flexGrow: 0,
    flexShrink: 1,
  },
});

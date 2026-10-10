import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  Dimensions,
  findNodeHandle,
  Platform,
  ScrollView,
  TextInput,
  UIManager,
} from "react-native";
import {
  KEYBOARD_SCROLL_PROPS,
  useKeyboardInset,
} from "../hooks/useKeyboardInset";
import { isKeyboardControllerLinked } from "../lib/keyboardController";

export { KEYBOARD_SCROLL_PROPS };

// ===== [KEYBOARD SCROLL] Constants: offsets, retry timings, linked native view =====
const DEFAULT_BOTTOM_OFFSET = Platform.OS === "ios" ? 16 : 20;
const MODAL_BOTTOM_OFFSET = Platform.OS === "ios" ? 24 : 32;
const FOCUSED_FIELD_GAP = 12;
const SCROLL_RETRY_MS = [32, 120, 280];

const LinkedKeyboardAwareScrollView = isKeyboardControllerLinked()
  ? require("react-native-keyboard-controller").KeyboardAwareScrollView
  : null;

// ===== [KEYBOARD SCROLL] Helpers: ref merging, TextInput focus injection, measuring =====
function assignRefs(...refs) {
  return (node) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") ref(node);
      else if (typeof ref === "object") ref.current = node;
    });
  };
}

function isTextInputElement(child) {
  if (!isValidElement(child)) return false;
  if (child.type === TextInput) return true;
  const typeName = String(
    child.type?.displayName || child.type?.name || child.type || ""
  );
  return typeName === "TextInput" || typeName.includes("TextInput");
}

function injectFocusHandlers(children, onFieldFocus) {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;

    const nextChildren =
      child.props?.children != null
        ? injectFocusHandlers(child.props.children, onFieldFocus)
        : child.props?.children;

    if (isTextInputElement(child)) {
      const originalOnFocus = child.props.onFocus;
      return cloneElement(child, {
        children: nextChildren,
        onFocus: (event) => {
          originalOnFocus?.(event);
          onFieldFocus?.(event);
        },
      });
    }

    if (nextChildren !== child.props?.children) {
      return cloneElement(child, { children: nextChildren });
    }

    return child;
  });
}

function measureTargetInWindow(target) {
  return new Promise((resolve) => {
    const finish = (x, y, width, height) => {
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        typeof width !== "number" ||
        typeof height !== "number"
      ) {
        resolve(null);
        return;
      }
      resolve({ x, y, width, height });
    };

    if (target && typeof target.measureInWindow === "function") {
      target.measureInWindow(finish);
      return;
    }

    const node = findNodeHandle(target);
    if (!node) {
      resolve(null);
      return;
    }
    UIManager.measureInWindow(node, finish);
  });
}

function resolveFocusTarget(event) {
  if (event?.target) return event.target;
  if (event?.currentTarget) return event.currentTarget;
  return (
    TextInput.State?.currentlyFocusedInput?.() ??
    TextInput.State?.currentlyFocusedField?.() ??
    null
  );
}

// ===== [KEYBOARD SCROLL] Fallback ScrollView (manual padding + scroll-to-focused) =====
function FallbackKeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  modal = false,
  bottomOffset,
  suppressContentPadding = false,
  keyboardShouldPersistTaps = KEYBOARD_SCROLL_PROPS.keyboardShouldPersistTaps,
  keyboardDismissMode = KEYBOARD_SCROLL_PROPS.keyboardDismissMode,
  scrollRef,
  onScroll,
  ...props
}) {
  // --- [KEYBOARD SCROLL] Keyboard inset & bottom padding ---
  const { keyboardHeight, androidNeedsManualPadding } = useKeyboardInset();
  const resolvedBottomOffset =
    bottomOffset ?? (modal ? MODAL_BOTTOM_OFFSET : DEFAULT_BOTTOM_OFFSET);
  // Don't stack keyboard padding when the window already resized, or when the
  // caller docks its own composer outside the scroll (submit page).
  const keyboardPad =
    !suppressContentPadding &&
    keyboardHeight > 0 &&
    (Platform.OS !== "android" || androidNeedsManualPadding)
      ? Math.max(keyboardHeight - 12, 0) + resolvedBottomOffset
      : 0;

  // --- [KEYBOARD SCROLL] Refs: scroll node, offset, pending focus target ---
  const nodeRef = useRef(null);
  const offsetYRef = useRef(0);
  const pendingTargetRef = useRef(null);
  const passRef = useRef(0);

  const setNodeRef = useCallback(
    (node) => {
      nodeRef.current = node;
      if (typeof scrollRef === "function") scrollRef(node);
      else if (scrollRef && typeof scrollRef === "object") {
        scrollRef.current = node;
      }
    },
    [scrollRef]
  );

  // --- [KEYBOARD SCROLL] Scroll focused field above keyboard (with retries) ---
  const scrollFocusedAboveKeyboard = useCallback(
    async (target, heightOverride) => {
      const activeHeight = heightOverride ?? keyboardHeight;
      if (!target || activeHeight <= 0) return;

      const layout = await measureTargetInWindow(target);
      if (!layout) return;

      const keyboardTop = Dimensions.get("window").height - activeHeight;
      const fieldBottom = layout.y + layout.height;
      const overlap = fieldBottom + FOCUSED_FIELD_GAP - keyboardTop;
      if (overlap <= 1) return;

      const nextY = Math.max(0, offsetYRef.current + overlap);
      nodeRef.current?.scrollTo?.({ x: 0, y: nextY, animated: true });
    },
    [keyboardHeight]
  );

  const scrollFocusedRef = useRef(scrollFocusedAboveKeyboard);
  scrollFocusedRef.current = scrollFocusedAboveKeyboard;

  const scheduleScroll = useCallback((target) => {
    if (!target) return;
    pendingTargetRef.current = target;
    const pass = ++passRef.current;

    SCROLL_RETRY_MS.forEach((delay) => {
      setTimeout(() => {
        if (passRef.current !== pass) return;
        const focused = pendingTargetRef.current;
        if (!focused) return;
        requestAnimationFrame(() => {
          scrollFocusedRef.current(focused);
        });
      }, delay);
    });
  }, []);

  // --- [KEYBOARD SCROLL] Re-scroll when keyboard height changes ---
  useEffect(() => {
    if (keyboardHeight <= 0) {
      pendingTargetRef.current = null;
      return;
    }
    const target = pendingTargetRef.current;
    if (!target) return;

    SCROLL_RETRY_MS.forEach((delay) => {
      setTimeout(() => {
        const focused = pendingTargetRef.current;
        if (!focused) return;
        scrollFocusedRef.current(focused, keyboardHeight);
      }, delay);
    });
  }, [keyboardHeight]);

  const handleFieldFocus = useCallback(
    (event) => {
      scheduleScroll(resolveFocusTarget(event));
    },
    [scheduleScroll]
  );

  // --- [KEYBOARD SCROLL] Render fallback ScrollView ---
  return (
    <ScrollView
      {...props}
      ref={setNodeRef}
      style={style}
      contentContainerStyle={[
        contentContainerStyle,
        keyboardPad > 0 && { paddingBottom: keyboardPad },
      ]}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      scrollEventThrottle={16}
      onScroll={(event) => {
        offsetYRef.current = event?.nativeEvent?.contentOffset?.y ?? 0;
        onScroll?.(event);
      }}
    >
      {injectFocusHandlers(children, handleFieldFocus)}
    </ScrollView>
  );
}

// ===== [KEYBOARD SCROLL] Exported component (picks plain / fallback / linked native view) =====
/**
 * App-wide KeyboardAwareScrollView.
 * Uses react-native-keyboard-controller when linked; otherwise pads + scrolls
 * the focused field just above the keyboard.
 */
const KeyboardAwareScrollView = forwardRef(function KeyboardAwareScrollView(
  {
    children,
    style,
    contentContainerStyle,
    modal = false,
    bottomOffset,
    enableOnAndroid: _enableOnAndroid,
    enableAutomaticScroll: _enableAutomaticScroll,
    enableResetScrollToCoords: _enableResetScrollToCoords,
    extraScrollHeight: _extraScrollHeight,
    extraHeight: _extraHeight,
    keyboardOpeningTime: _keyboardOpeningTime,
    keyboardVerticalOffset: _keyboardVerticalOffset,
    smoothKeyboard: _smoothKeyboard,
    suppressContentPadding = false,
    keyboardShouldPersistTaps = KEYBOARD_SCROLL_PROPS.keyboardShouldPersistTaps,
    keyboardDismissMode = KEYBOARD_SCROLL_PROPS.keyboardDismissMode,
    innerRef,
    ...props
  },
  forwardedRef
) {
  const resolvedBottomOffset =
    bottomOffset ?? (modal ? MODAL_BOTTOM_OFFSET : DEFAULT_BOTTOM_OFFSET);
  const scrollRef = useCallback(
    assignRefs(innerRef, forwardedRef),
    [innerRef, forwardedRef]
  );

  // External composers (submit chat dock) already clear the keyboard. Do not
  // use keyboard-aware padding/scroll here — it leaves a huge empty band
  // between the last message and the text field.
  if (suppressContentPadding && !modal) {
    return (
      <ScrollView
        {...props}
        ref={scrollRef}
        style={style}
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
      >
        {children}
      </ScrollView>
    );
  }

  // RN Modal + keyboard-controller is unreliable; use measure/scroll fallback
  // so lower fields (e.g. Location) stay just above the keyboard.
  if (!LinkedKeyboardAwareScrollView || modal) {
    return (
      <FallbackKeyboardAwareScrollView
        {...props}
        scrollRef={scrollRef}
        style={style}
        contentContainerStyle={contentContainerStyle}
        modal={modal}
        bottomOffset={resolvedBottomOffset}
        suppressContentPadding={suppressContentPadding}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
      >
        {children}
      </FallbackKeyboardAwareScrollView>
    );
  }

  // --- [KEYBOARD SCROLL] Render native keyboard-controller view ---
  return (
    <LinkedKeyboardAwareScrollView
      {...props}
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      bottomOffset={resolvedBottomOffset}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
    >
      {children}
    </LinkedKeyboardAwareScrollView>
  );
});

export default KeyboardAwareScrollView;

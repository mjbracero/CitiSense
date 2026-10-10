import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { confirmStore, inferConfirmDialogMeta } from "../lib/toast";

// ===== [CONFIRM DIALOG] Colors & dialog width =====
const DIALOG_WIDTH = Math.min(Dimensions.get("window").width - 48, 320);

// ===== [CONFIRM DIALOG] Helpers: button type checks =====
function isCancelButton(button) {
  return button?.style === "cancel" || button?.text === "Cancel";
}

function isDestructiveButton(button) {
  return button?.style === "destructive";
}

// ===== [CONFIRM DIALOG] Global confirm dialog host =====
export default function ConfirmDialogHost() {
  // --- [CONFIRM DIALOG] State, fonts & confirmStore subscription ---
  const [dialog, setDialog] = useState(null);
  useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => confirmStore.subscribe(setDialog), []);

  // --- [CONFIRM DIALOG] Derived: buttons, meta (icon/accent), layout mode ---
  const buttons = dialog?.buttons || [];
  const options = dialog?.options || {};
  const cancelable = options.cancelable !== false;

  const meta = useMemo(
    () => inferConfirmDialogMeta(dialog?.title, buttons),
    [dialog?.title, buttons]
  );

  const stackedActions = buttons.length > 2;
  const actionButtons = stackedActions
    ? buttons.filter((button) => !isCancelButton(button))
    : buttons.filter((button) => !isCancelButton(button));
  const cancelButton = buttons.find((button) => isCancelButton(button));

  // --- [CONFIRM DIALOG] Handlers: dismiss, backdrop, button press ---
  const dismissDialog = () => {
    confirmStore.dismiss();
  };

  const handleBackdropPress = () => {
    if (!cancelable) return;

    if (typeof cancelButton?.onPress === "function") {
      cancelButton.onPress();
    } else if (typeof options.onDismiss === "function") {
      options.onDismiss();
    }

    dismissDialog();
  };

  const handleButtonPress = (button) => {
    dismissDialog();
    button?.onPress?.();
  };

  // --- [CONFIRM DIALOG] Render ---
  if (!dialog) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleBackdropPress}
    >
      <Pressable
        style={styles.overlay}
        onPress={handleBackdropPress}
        disabled={!cancelable}
      >
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={styles.cardShell}
        >
          <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
            {/* [CONFIRM DIALOG UI] Icon */}
            <View style={[styles.iconWrap, { backgroundColor: meta.iconBackground }]}>
              <Ionicons name={meta.icon} size={24} color={meta.accent} />
            </View>

            {/* [CONFIRM DIALOG UI] Title & message */}
            <Text style={styles.title}>{dialog.title}</Text>

            {dialog.message ? (
              <Text style={styles.message}>{dialog.message}</Text>
            ) : null}

            {/* [CONFIRM DIALOG UI] Actions: stacked (3+ buttons) or side-by-side row */}
            {stackedActions ? (
              <View style={styles.stackedActions}>
                {actionButtons.map((button) => (
                  <Pressable
                    key={button.text}
                    style={({ pressed }) => [
                      styles.stackedButton,
                      isDestructiveButton(button)
                        ? styles.stackedButtonDestructive
                        : styles.stackedButtonPrimary,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.stackedButtonText,
                        isDestructiveButton(button)
                          ? styles.destructiveText
                          : styles.primaryText,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}

                {cancelButton ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.stackedCancel,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => handleButtonPress(cancelButton)}
                  >
                    <Text style={styles.cancelText}>{cancelButton.text}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.rowActions}>
                {cancelButton ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.rowButton,
                      styles.rowButtonOutline,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => handleButtonPress(cancelButton)}
                  >
                    <Text style={styles.cancelText}>{cancelButton.text}</Text>
                  </Pressable>
                ) : null}

                {actionButtons.map((button) => (
                  <Pressable
                    key={button.text}
                    style={({ pressed }) => [
                      styles.rowButton,
                      isDestructiveButton(button)
                        ? styles.rowButtonDestructive
                        : styles.rowButtonPrimary,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => handleButtonPress(button)}
                  >
                    <Text
                      style={[
                        styles.rowButtonText,
                        isDestructiveButton(button)
                          ? styles.destructiveTextOnFill
                          : styles.primaryTextOnFill,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ===== [CONFIRM DIALOG] Styles =====
const styles = StyleSheet.create({
  // --- Overlay & card ---
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  cardShell: {
    width: DIALOG_WIDTH,
  },

  card: {
    width: DIALOG_WIDTH,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },

  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "rgba(23, 23, 23, 1)",
    textAlign: "center",
    lineHeight: 22,
    width: "100%",
  },

  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "rgba(90, 97, 90, 1)",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 4,
    width: "100%",
  },

  // --- Row actions ---
  rowActions: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    width: "100%",
    gap: 10,
    marginTop: 18,
  },

  rowButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  rowButtonOutline: {
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderWidth: 1,
    borderColor: "rgba(227, 232, 224, 1)",
  },

  rowButtonPrimary: {
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  rowButtonDestructive: {
    backgroundColor: "rgba(215, 25, 32, 1)",
  },

  rowButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    textAlign: "center",
  },

  primaryTextOnFill: {
    color: "rgba(255, 255, 255, 1)",
  },

  destructiveTextOnFill: {
    color: "rgba(255, 255, 255, 1)",
  },

  cancelText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(90, 97, 90, 1)",
    textAlign: "center",
  },

  // --- Stacked actions ---
  stackedActions: {
    alignSelf: "stretch",
    width: "100%",
    marginTop: 16,
    gap: 8,
  },

  stackedButton: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  stackedButtonPrimary: {
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(198, 228, 192, 1)",
  },

  stackedButtonDestructive: {
    backgroundColor: "rgba(255, 244, 244, 1)",
    borderWidth: 1,
    borderColor: "rgba(243, 196, 198, 1)",
  },

  stackedButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    textAlign: "center",
  },

  primaryText: {
    color: "rgba(8, 122, 13, 1)",
  },

  destructiveText: {
    color: "rgba(215, 25, 32, 1)",
  },

  stackedCancel: {
    width: "100%",
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  buttonPressed: {
    opacity: 0.82,
  },
});

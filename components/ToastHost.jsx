import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toastStore } from "../lib/toast";

// ===== [TOAST] Icon & colors per toast type =====
const TYPE_META = {
  success: {
    icon: "checkmark-circle",
    color: "rgba(8, 122, 13, 1)",
    background: "rgba(243, 250, 241, 1)",
    border: "rgba(198, 228, 192, 1)",
  },
  error: {
    icon: "close-circle",
    color: "rgba(215, 25, 32, 1)",
    background: "rgba(255, 245, 245, 1)",
    border: "rgba(243, 196, 198, 1)",
  },
  warning: {
    icon: "warning",
    color: "rgba(201, 120, 18, 1)",
    background: "rgba(255, 248, 238, 1)",
    border: "rgba(243, 215, 179, 1)",
  },
  info: {
    icon: "information-circle",
    color: "rgba(49, 90, 154, 1)",
    background: "rgba(243, 246, 251, 1)",
    border: "rgba(201, 212, 234, 1)",
  },
};

// ===== [TOAST] Global toast host =====
export default function ToastHost() {
  // --- [TOAST] State, fonts & toastStore subscription ---
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState([]);
  useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
  });

  useEffect(() => toastStore.subscribe(setToasts), []);

  // --- [TOAST] Render ---
  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: Math.max(insets.top, 12) + 8 }]}
    >
      {/* [TOAST UI] Stacked toast cards (tap to dismiss) */}
      {toasts.map((item) => {
        const meta = TYPE_META[item.type] || TYPE_META.info;

        return (
          <Animated.View
            key={item.id}
            entering={FadeInUp.duration(220)}
            exiting={FadeOutUp.duration(160)}
          >
            <Pressable
              onPress={() => toastStore.dismiss(item.id)}
              style={[
                styles.toast,
                {
                  backgroundColor: meta.background,
                  borderColor: meta.border,
                },
              ]}
            >
              {/* [TOAST UI] Accent bar & icon */}
              <View style={[styles.accent, { backgroundColor: meta.color }]} />
              <Ionicons name={meta.icon} size={22} color={meta.color} />
              {/* [TOAST UI] Title & message */}
              <View style={styles.copy}>
                {item.title ? (
                  <Text
                    style={[styles.title, { color: meta.color }]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                ) : null}
                {item.message ? (
                  <Text style={styles.message} numberOfLines={3}>
                    {item.message}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ===== [TOAST] Styles =====
const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 14,
    gap: 8,
  },

  toast: {
    flexDirection: "row",
    alignItems: "flex-start",
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 12,
    gap: 10,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  accent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },

  copy: {
    flex: 1,
    paddingTop: 1,
  },

  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },

  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(58, 58, 58, 1)",
    marginTop: 2,
  },
});

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

const TYPE_META = {
  success: {
    icon: "checkmark-circle",
    color: "#087A0D",
    background: "#F3FAF1",
    border: "#C6E4C0",
  },
  error: {
    icon: "close-circle",
    color: "#D71920",
    background: "#FFF5F5",
    border: "#F3C4C6",
  },
  warning: {
    icon: "warning",
    color: "#C97812",
    background: "#FFF8EE",
    border: "#F3D7B3",
  },
  info: {
    icon: "information-circle",
    color: "#315A9A",
    background: "#F3F6FB",
    border: "#C9D4EA",
  },
};

export default function ToastHost() {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = useState([]);
  useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
  });

  useEffect(() => toastStore.subscribe(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: Math.max(insets.top, 12) + 8 }]}
    >
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
              <View style={[styles.accent, { backgroundColor: meta.color }]} />
              <Ionicons name={meta.icon} size={22} color={meta.color} />
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
    shadowColor: "#000000",
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
    color: "#3A3A3A",
    marginTop: 2,
  },
});

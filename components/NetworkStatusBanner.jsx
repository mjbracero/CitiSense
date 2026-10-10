import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useConnectionQuality from "../hooks/useConnectionQuality";

// ===== [NETWORK BANNER] Look & copy per connection state =====
const STATUS_META = {
  offline: {
    icon: "cloud-offline",
    color: "rgba(255, 255, 255, 1)",
    background: "rgba(215, 25, 32, 1)",
    title: "No internet connection",
    message: "Check your Wi-Fi or mobile data.",
  },
  server_down: {
    icon: "warning",
    color: "rgba(255, 255, 255, 1)",
    background: "rgba(180, 83, 9, 1)",
    title: "CitiSense is temporarily unavailable",
    message: "Emergency? Tap to call 911.",
    dialNumber: "911",
  },
  slow: {
    icon: "cellular",
    color: "rgba(92, 58, 0, 1)",
    background: "rgba(255, 209, 102, 1)",
    title: "Slow internet connection",
    message: null,
  },
  restored: {
    icon: "checkmark-circle",
    color: "rgba(255, 255, 255, 1)",
    background: "rgba(8, 122, 13, 1)",
    title: "Back online",
    message: null,
  },
};

const RESTORED_VISIBLE_MS = 2500;

// ===== [NETWORK BANNER] Global connection status banner =====
export default function NetworkStatusBanner() {
  // --- [NETWORK BANNER] Connection state & "back online" flash ---
  const insets = useSafeAreaInsets();
  const quality = useConnectionQuality();
  const [showRestored, setShowRestored] = useState(false);
  const previousRef = useRef(quality);
  useFonts({ Poppins_400Regular, Poppins_600SemiBold });

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = quality;

    if (quality === "online" && previous !== "online") {
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), RESTORED_VISIBLE_MS);
      return () => clearTimeout(timer);
    }

    if (quality !== "online") setShowRestored(false);
    return undefined;
  }, [quality]);

  // --- [NETWORK BANNER] Render ---
  const statusKey = quality === "online" ? (showRestored ? "restored" : null) : quality;
  if (!statusKey) return null;

  const meta = STATUS_META[statusKey];
  const dialEmergency = meta.dialNumber
    ? () => Linking.openURL(`tel:${meta.dialNumber}`).catch(() => {})
    : undefined;

  return (
    <View
      pointerEvents={dialEmergency ? "box-none" : "none"}
      style={[styles.host, { top: Math.max(insets.top, 8) + 4 }]}
    >
      {/* [NETWORK BANNER UI] Status pill */}
      <Animated.View
        key={statusKey}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(160)}
      >
        <Pressable
          disabled={!dialEmergency}
          onPress={dialEmergency}
          style={[styles.pill, { backgroundColor: meta.background }]}
        >
          <Ionicons name={meta.icon} size={18} color={meta.color} />
          <View style={styles.copy}>
            <Text style={[styles.title, { color: meta.color }]} numberOfLines={1}>
              {meta.title}
            </Text>
            {meta.message ? (
              <Text style={[styles.message, { color: meta.color }]} numberOfLines={1}>
                {meta.message}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ===== [NETWORK BANNER] Styles =====
const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10000,
    elevation: 10000,
    paddingHorizontal: 14,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: "100%",
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },

  copy: {
    flexShrink: 1,
  },

  title: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    lineHeight: 17,
  },

  message: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 15,
    opacity: 0.92,
  },
});

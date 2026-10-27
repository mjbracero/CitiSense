import { useEffect } from "react";
import { View, Image, StyleSheet, Dimensions } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// ===== [AUTH CHROME] Assets, dimensions & exported auth colors =====
const logo = require("../assets/images/logowname.png");
const { width: SCREEN_WIDTH } = Dimensions.get("window");


// ===== [AUTH CHROME] Floating icon config around the logo =====
const LOGO_ORBIT_ICONS = [
  {
    key: "people",
    family: "ion",
    name: "people",
    size: 20,
    color: "rgba(10, 118, 10, 1)",
    top: 12,
    left: 10,
    amplitude: 8,
    duration: 2100,
    delay: 0,
  },
  {
    key: "building",
    family: "mci",
    name: "office-building",
    size: 20,
    color: "rgba(10, 118, 10, 1)",
    top: 10,
    right: 8,
    amplitude: 9,
    duration: 2400,
    delay: 180,
  },
  {
    key: "location",
    family: "ion",
    name: "location",
    size: 18,
    color: "rgba(109, 187, 63, 1)",
    bottom: 22,
    left: 4,
    amplitude: 7,
    duration: 2300,
    delay: 320,
  },
  {
    key: "construct",
    family: "ion",
    name: "construct",
    size: 17,
    color: "rgba(10, 118, 10, 1)",
    bottom: 18,
    right: 6,
    amplitude: 8,
    duration: 2500,
    delay: 420,
  },
  {
    key: "leaf",
    family: "ion",
    name: "leaf",
    size: 16,
    color: "rgba(109, 187, 63, 1)",
    top: 78,
    left: -8,
    amplitude: 6,
    duration: 2600,
    delay: 260,
  },
  {
    key: "shield",
    family: "mci",
    name: "shield-check",
    size: 17,
    color: "rgba(10, 118, 10, 1)",
    top: 76,
    right: -6,
    amplitude: 7,
    duration: 2200,
    delay: 500,
  },
];

// ===== [AUTH CHROME] Subcomponent: decorative background blob =====
function SoftBlob({ style }) {
  return <View pointerEvents="none" style={[styles.blob, style]} />;
}

// ===== [AUTH CHROME] Subcomponent: animated floating icon =====
function FloatingLogoIcon({
  family,
  name,
  size,
  color,
  amplitude,
  duration,
  delay,
  style,
  boxStyle,
}) {
  // --- [AUTH CHROME] Looping float animation (X/Y) ---
  const floatY = useSharedValue(0);
  const floatX = useSharedValue(0);

  useEffect(() => {
    floatY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-amplitude, {
            duration,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(amplitude * 0.4, {
            duration,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );

    floatX.value = withDelay(
      delay + 120,
      withRepeat(
        withSequence(
          withTiming(amplitude * 0.35, {
            duration: duration + 200,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-amplitude * 0.25, {
            duration: duration + 200,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
  }, [amplitude, delay, duration, floatX, floatY]);

  const motionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: floatY.value },
      { translateX: floatX.value },
    ],
  }));

  return (
    <Animated.View
      entering={FadeIn.delay(delay).duration(520)}
      style={[boxStyle || styles.orbitIcon, style, motionStyle]}
      pointerEvents="none"
    >
      {family === "mci" ? (
        <MaterialCommunityIcons name={name} size={size} color={color} />
      ) : (
        <Ionicons name={name} size={size} color={color} />
      )}
    </Animated.View>
  );
}

// ===== [AUTH CHROME] Exported: gradient background with blobs =====
export function AuthScreenBackground() {
  return (
    <>
      <LinearGradient
        colors={["rgba(243, 250, 241, 1)", "rgba(255, 255, 255, 1)", "rgba(238, 247, 234, 1)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SoftBlob style={styles.blobTopLeft} />
      <SoftBlob style={styles.blobTopRight} />
      <SoftBlob style={styles.blobBottom} />
    </>
  );
}

// ===== [AUTH CHROME] Exported: logo with orbiting icons =====
export function AuthLogoStage({ compact = false }) {
  const stageStyle = compact ? styles.logoStageCompact : styles.logoStage;
  const logoStyle = compact ? styles.logoCompact : styles.logo;
  const iconBoxStyle = compact ? styles.orbitIconCompact : styles.orbitIcon;

  return (
    <View style={stageStyle}>
      {/* [AUTH CHROME UI] Orbiting icons */}
      {LOGO_ORBIT_ICONS.map((icon) => (
        <FloatingLogoIcon
          key={icon.key}
          family={icon.family}
          name={icon.name}
          size={compact ? Math.max(14, icon.size - 3) : icon.size}
          color={icon.color}
          amplitude={icon.amplitude}
          duration={icon.duration}
          delay={icon.delay}
          boxStyle={iconBoxStyle}
          style={{
            top: compact && icon.top != null ? icon.top * 0.72 : icon.top,
            left: icon.left,
            right: icon.right,
            bottom:
              compact && icon.bottom != null ? icon.bottom * 0.72 : icon.bottom,
          }}
        />
      ))}
      {/* [AUTH CHROME UI] Logo image */}
      <Image source={logo} style={logoStyle} resizeMode="contain" />
    </View>
  );
}

// ===== [AUTH CHROME] Styles =====
const styles = StyleSheet.create({
  // --- Background blobs ---
  blob: {
    position: "absolute",
    borderRadius: 999,
    opacity: 0.55,
  },
  blobTopLeft: {
    width: SCREEN_WIDTH * 0.72,
    height: SCREEN_WIDTH * 0.72,
    top: -SCREEN_WIDTH * 0.28,
    left: -SCREEN_WIDTH * 0.28,
    backgroundColor: "rgba(221, 239, 212, 1)",
  },
  blobTopRight: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    top: 40,
    right: -SCREEN_WIDTH * 0.22,
    backgroundColor: "rgba(231, 245, 219, 1)",
  },
  blobBottom: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.55,
    bottom: -SCREEN_WIDTH * 0.18,
    left: -SCREEN_WIDTH * 0.12,
    backgroundColor: "rgba(226, 240, 218, 1)",
  },
  // --- Logo stage & orbit icons ---
  logoStage: {
    width: 260,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logoStageCompact: {
    width: 220,
    height: 168,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logo: {
    width: 180,
    height: 180,
    zIndex: 1,
  },
  logoCompact: {
    width: 136,
    height: 136,
    zIndex: 1,
  },
  orbitIcon: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "rgba(10, 118, 10, 1)",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orbitIconCompact: {
    position: "absolute",
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    shadowColor: "rgba(10, 118, 10, 1)",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

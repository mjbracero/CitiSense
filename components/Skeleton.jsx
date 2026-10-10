import { useEffect, useRef } from "react";
import { Animated } from "react-native";

// ===== [SKELETON] Pulsing placeholder block =====

export default function Skeleton({
  width,
  height,
  borderRadius = 8,
  style,
}) {
  const opacity = useRef(new Animated.Value(0.42)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.92,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();

    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          borderRadius,
          backgroundColor: "rgba(228, 235, 226, 1)",
          opacity,
        },
        width !== undefined ? { width } : null,
        style,
      ]}
    />
  );
}

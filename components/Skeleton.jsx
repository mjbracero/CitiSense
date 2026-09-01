import { useEffect, useRef } from "react";
import { Animated } from "react-native";

const BONE = "#E4EBE2";

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
          backgroundColor: BONE,
          opacity,
        },
        width !== undefined ? { width } : null,
        style,
      ]}
    />
  );
}

import { Stack } from "expo-router";

export default function DepartmentHeadLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none",
        gestureEnabled: false,
        fullScreenGestureEnabled: false,
      }}
    />
  );
}

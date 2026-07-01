import { Stack } from "expo-router";

export default function CitizenLayout() {
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

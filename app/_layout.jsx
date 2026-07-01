import "react-native-gesture-handler";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import usePushNotifications from "../hooks/usePushNotifications";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  usePushNotifications();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
    </SafeAreaProvider>
  );
}

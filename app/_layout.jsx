import "react-native-gesture-handler";
import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import AndroidSystemChrome from "../components/AndroidSystemChrome";
import AppKeyboardProvider from "../components/AppKeyboardProvider";
import ConfirmDialogHost from "../components/ConfirmDialogHost";
import NetworkStatusBanner from "../components/NetworkStatusBanner";
import ToastHost from "../components/ToastHost";
import usePushNotifications from "../hooks/usePushNotifications";
import { supabase } from "../lib/supabase";
import {
  completeEmailConfirmationFromUrl,
  establishSessionFromAuthUrl,
  isAuthCallbackUrl,
  isPasswordResetCallbackUrl,
  markPasswordRecoveryActive,
} from "../lib/passwordReset";

// ===== [ROOT LAYOUT] Keep native splash visible until mount =====
SplashScreen.preventAutoHideAsync().catch(() => {});

// ===== [ROOT LAYOUT] Root layout component =====
export default function RootLayout() {
  // --- [ROOT LAYOUT] Router & push notifications ---
  const router = useRouter();
  usePushNotifications();

  // --- [ROOT LAYOUT] Hide native splash on mount ---
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // --- [ROOT LAYOUT] Auth deep links & password recovery listener ---
  useEffect(() => {
    const handleIncomingUrl = async (url) => {
      if (!url || !isAuthCallbackUrl(url)) {
        return;
      }

      try {
        if (isPasswordResetCallbackUrl(url)) {
          await establishSessionFromAuthUrl(url);
          await markPasswordRecoveryActive(true);
          router.replace("/auth/resetPassword");
          return;
        }

        // Signup email confirm → verify email, then login (not reset password).
        const { confirmed } = await completeEmailConfirmationFromUrl(url);
        router.replace(
          confirmed ? "/auth/login?confirmed=1" : "/auth/login"
        );
      } catch (error) {
        console.log("Auth deep link error:", error);
        router.replace("/auth/login");
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          handleIncomingUrl(url);
        }
      })
      .catch(() => {});

    const linkingSub = Linking.addEventListener("url", ({ url }) => {
      handleIncomingUrl(url);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "PASSWORD_RECOVERY") {
        await markPasswordRecoveryActive(true);
        router.replace("/auth/resetPassword");
      }
    });

    return () => {
      linkingSub.remove();
      subscription.unsubscribe();
    };
  }, [router]);

  // --- [ROOT LAYOUT] Render ---
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppKeyboardProvider>
        {/* [ROOT LAYOUT UI] Status bar & Android system chrome */}
        <StatusBar style="dark" translucent={Platform.OS === "android"} />
        <AndroidSystemChrome />
        {/* [ROOT LAYOUT UI] Main navigation stack */}
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "none",
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        {/* [ROOT LAYOUT UI] Offline / slow internet banner */}
        <NetworkStatusBanner />
        {/* [ROOT LAYOUT UI] Global toast & confirm dialog hosts */}
        <ToastHost />
        <ConfirmDialogHost />
      </AppKeyboardProvider>
    </SafeAreaProvider>
  );
}

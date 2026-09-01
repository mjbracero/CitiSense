import "react-native-gesture-handler";
import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import usePushNotifications from "../hooks/usePushNotifications";
import { supabase } from "../lib/supabase";
import {
  completeEmailConfirmationFromUrl,
  establishSessionFromAuthUrl,
  isAuthCallbackUrl,
  isPasswordResetCallbackUrl,
  markPasswordRecoveryActive,
} from "../lib/passwordReset";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  usePushNotifications();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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

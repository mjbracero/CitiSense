import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import {
  Poppins_400Regular,
  useFonts,
} from "@expo-google-fonts/poppins";
import {
  AuthLogoStage,
  AuthScreenBackground,
} from "../components/AuthScreenChrome";
import { resolveAuthenticatedHomeRoute } from "../lib/authRouting";
import { requestStartupPermissions } from "../lib/requestStartupPermissions";
import {
  consumeInitialEmailConfirmUrl,
  consumeInitialPasswordResetUrl,
  isPasswordRecoveryActive,
} from "../lib/passwordReset";

const MIN_SPLASH_MS = 1100;

export default function SplashScreen() {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
  });

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const startedAt = Date.now();

      const finish = async (route) => {
        const isLoginRoute =
          route === "/auth/login" || String(route).startsWith("/auth/login");
        const elapsed = Date.now() - startedAt;
        const wait = isLoginRoute
          ? 0
          : Math.max(0, MIN_SPLASH_MS - elapsed);

        if (wait > 0) {
          await new Promise((resolve) => setTimeout(resolve, wait));
        }

        if (!cancelled) {
          router.replace(route);
        }
      };

      try {
        const recovery = await consumeInitialPasswordResetUrl();

        if (
          !cancelled &&
          recovery?.recovery &&
          (recovery?.session || isPasswordRecoveryActive())
        ) {
          await finish("/auth/resetPassword");
          return;
        }
      } catch (error) {
        console.log("Splash password-reset URL error:", error);
      }

      try {
        const confirmed = await consumeInitialEmailConfirmUrl();
        if (!cancelled && confirmed?.confirmed) {
          await finish("/auth/login?confirmed=1");
          return;
        }
      } catch (error) {
        console.log("Splash email-confirm URL error:", error);
      }

      try {
        await requestStartupPermissions();
      } catch (error) {
        console.log("Startup permissions error:", error);
      }

      if (isPasswordRecoveryActive()) {
        await finish("/auth/resetPassword");
        return;
      }

      const route = await resolveAuthenticatedHomeRoute();
      await finish(route);
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <AuthScreenBackground />

      <View style={styles.content}>
        <Animated.View entering={FadeIn.duration(420)}>
          <AuthLogoStage />
        </Animated.View>

        {fontsLoaded ? (
          <Animated.Text
            entering={FadeInDown.delay(160).duration(480)}
            style={styles.subtitle}
          >
            Smarter reporting for a better Bogo City.
          </Animated.Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3FAF1",
  },

  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  subtitle: {
    marginTop: 6,
    maxWidth: 280,
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
    color: "#4A554A",
    textAlign: "center",
  },
});

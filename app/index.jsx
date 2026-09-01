import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  useFonts,
} from "@expo-google-fonts/poppins";
import {
  AuthLogoStage,
  AuthScreenBackground,
  AUTH_GREEN,
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
  const pulse = useSharedValue(0.45);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
  });

  useEffect(() => {
    pulse.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.45, {
            duration: 900,
            easing: Easing.inOut(Easing.quad),
          })
        ),
        -1,
        false
      )
    );
  }, [pulse]);

  const statusStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const startedAt = Date.now();

      const finish = async (route) => {
        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_SPLASH_MS - elapsed);

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
            Smarter civic reporting for a better Bogo City.
          </Animated.Text>
        ) : null}

        <Animated.View
          entering={FadeInUp.delay(360).duration(500)}
          style={styles.statusRow}
        >
          <ActivityIndicator size="small" color={AUTH_GREEN} />
          <Animated.Text style={[styles.statusText, statusStyle]}>
            Getting things ready…
          </Animated.Text>
        </Animated.View>
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

  statusRow: {
    marginTop: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  statusText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "#5F6A5F",
  },
});

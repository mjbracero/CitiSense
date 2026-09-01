import { View, Image, StyleSheet } from "react-native";
import { useEffect } from "react";
import { useRouter } from "expo-router";
import { resolveAuthenticatedHomeRoute } from "../lib/authRouting";
import { requestStartupPermissions } from "../lib/requestStartupPermissions";
import {
  consumeInitialEmailConfirmUrl,
  consumeInitialPasswordResetUrl,
  isPasswordRecoveryActive,
} from "../lib/passwordReset";

const logo = require("../assets/images/logowname.png");

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const recovery = await consumeInitialPasswordResetUrl();

        if (
          !cancelled &&
          recovery?.recovery &&
          (recovery?.session || isPasswordRecoveryActive())
        ) {
          router.replace("/auth/resetPassword");
          return;
        }
      } catch (error) {
        console.log("Splash password-reset URL error:", error);
      }

      try {
        // Signup email confirm uses citisense://auth/login — verify, then login.
        const confirmed = await consumeInitialEmailConfirmUrl();
        if (!cancelled && confirmed?.confirmed) {
          router.replace("/auth/login?confirmed=1");
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
        if (!cancelled) {
          router.replace("/auth/resetPassword");
        }
        return;
      }

      const route = await resolveAuthenticatedHomeRoute();

      if (!cancelled) {
        router.replace(route);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 180,
    height: 180,
  },
});

import {
  useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import { PageSkeleton } from "../../components/skeletons";
import { writeAuditLog } from "../../lib/auditLogService";
import {
  establishSessionFromAuthParams,
  establishSessionFromAuthUrl,
  hydratePasswordRecoveryFlag,
  isPasswordRecoveryActive,
  isPasswordResetCallbackUrl,
  markPasswordRecoveryActive,
  waitForRecoverySession,
} from "../../lib/passwordReset";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

// ===== [AUTH RESET] Assets & colors =====
const logo = require("../../assets/images/logowname.png");

// ===== [AUTH RESET] Reset password screen component =====
export default function ResetPasswordScreen() {
  // --- [AUTH RESET] State: passwords, toggles, link status ---
  const router = useRouter();
  const routeParams = useLocalSearchParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkReady, setLinkReady] = useState(false);

  // --- [AUTH RESET] Fonts ---
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [AUTH RESET] Activate recovery session from a deep link URL ---
  const activateResetSession = useCallback(async (url) => {
    if (!url) {
      return false;
    }

    const result = await establishSessionFromAuthUrl(url);

    if (result?.session) {
      await markPasswordRecoveryActive(true);
      setLinkReady(true);
      return true;
    }

    return false;
  }, []);

  // --- [AUTH RESET] Deep link handling: route params, initial URL, auth events ---
  useEffect(() => {
    let active = true;

    const code = Array.isArray(routeParams.code)
      ? routeParams.code[0]
      : routeParams.code;
    const accessToken = Array.isArray(routeParams.access_token)
      ? routeParams.access_token[0]
      : routeParams.access_token;
    const refreshToken = Array.isArray(routeParams.refresh_token)
      ? routeParams.refresh_token[0]
      : routeParams.refresh_token;
    const type = Array.isArray(routeParams.type)
      ? routeParams.type[0]
      : routeParams.type;
    const tokenHash = Array.isArray(routeParams.token_hash)
      ? routeParams.token_hash[0]
      : routeParams.token_hash ||
        (Array.isArray(routeParams.token)
          ? routeParams.token[0]
          : routeParams.token);
    const errorParam = Array.isArray(routeParams.error)
      ? routeParams.error[0]
      : routeParams.error;
    const errorDescription = Array.isArray(routeParams.error_description)
      ? routeParams.error_description[0]
      : routeParams.error_description;

    const prepareResetSession = async () => {
      try {
        await hydratePasswordRecoveryFlag();

        const paramResult = await establishSessionFromAuthParams({
          code,
          access_token: accessToken,
          refresh_token: refreshToken,
          type,
          token_hash: tokenHash,
          error: errorParam,
          error_description: errorDescription,
        });

        if (paramResult?.session) {
          if (active) setLinkReady(true);
          return;
        }

        const initialUrl = await Linking.getInitialURL();

        if (initialUrl && isPasswordResetCallbackUrl(initialUrl)) {
          const ok = await activateResetSession(initialUrl);
          if (ok) return;
        }

        const session = await waitForRecoverySession();
        if (session && active) {
          setLinkReady(true);
        }
      } catch (error) {
        console.log("Reset link check error:", error);
        notify(
          "Invalid Reset Link",
          error?.message || "Please request a new password reset email."
        );
      } finally {
        if (active) {
          setCheckingLink(false);
        }
      }
    };

    prepareResetSession();

    const linkingSub = Linking.addEventListener("url", async ({ url }) => {
      if (!isPasswordResetCallbackUrl(url)) {
        return;
      }

      try {
        await activateResetSession(url);
      } catch (error) {
        notify(
          "Invalid Reset Link",
          error?.message || "Please request a new password reset email."
        );
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        return;
      }

      if (event === "PASSWORD_RECOVERY") {
        await markPasswordRecoveryActive(true);
        setLinkReady(true);
        setCheckingLink(false);
        return;
      }

      if (isPasswordRecoveryActive()) {
        setLinkReady(true);
        setCheckingLink(false);
      }
    });

    return () => {
      active = false;
      linkingSub.remove();
      subscription.unsubscribe();
    };
  }, [
    activateResetSession,
    routeParams.access_token,
    routeParams.code,
    routeParams.error,
    routeParams.error_description,
    routeParams.refresh_token,
    routeParams.token,
    routeParams.token_hash,
    routeParams.type,
  ]);

  if (!fontsLoaded) return <PageSkeleton variant="auth" />;

  // --- [AUTH RESET] Update password handler ---
  const handleUpdatePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      notify(
        "Missing Fields",
        "Please enter and confirm your new password."
      );
      return;
    }

    if (newPassword.length < 6) {
      notify("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      notify("Password Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      let session = (await supabase.auth.getSession()).data?.session;

      if (!session) {
        session = await waitForRecoverySession({ attempts: 4, delayMs: 300 });
      }

      if (!session) {
        notify(
          "Invalid Reset Session",
          "Open the reset link from your email on this phone first, then set your new password."
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        notify("Reset Failed", error.message);
        return;
      }

      await writeAuditLog({
        action: "password_reset",
        title: "Password Reset",
        description: "Account password was reset through the email recovery link.",
      });
      await markPasswordRecoveryActive(false);
      await supabase.auth.signOut();

      notify(
        "Password Updated",
        "Your password has been changed successfully. Please log in again.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/auth/login"),
          },
        ]
      );
    } catch (error) {
      console.log("Update password error:", error);
      notify("Error", String(error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  // --- [AUTH RESET] Render: skeleton while checking link ---
  if (checkingLink) {
    return <PageSkeleton variant="auth" />;
  }

  // --- [AUTH RESET] Render ---
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* [AUTH RESET UI] Keyboard-aware scroll container */}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        enableOnAndroid
        enableAutomaticScroll
        enableResetScrollToCoords={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        extraScrollHeight={Platform.OS === "android" ? 8 : 12}
        extraHeight={Platform.OS === "android" ? 10 : 12}
        showsVerticalScrollIndicator={false}
        bounces
      >
          {/* [AUTH RESET UI] Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={async () => {
              await markPasswordRecoveryActive(false);
              router.replace("/auth/login");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="rgba(10, 118, 10, 1)" />
          </TouchableOpacity>

          {/* [AUTH RESET UI] Logo, lock icon, title & subtitle */}
          <Image source={logo} style={styles.logo} resizeMode="contain" />

          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={38} color="rgba(10, 118, 10, 1)" />
          </View>

          <Text style={styles.title}>Reset Password</Text>

          <Text style={styles.subtitle}>
            Create a new password for your CitiSense account.
          </Text>

          {/* [AUTH RESET UI] Warning when reset link not opened yet */}
          {!linkReady && (
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color="rgba(215, 25, 32, 1)" />

              <Text style={styles.warningText}>
                Open the reset link from your email on this phone first. After
                the app opens from that link, you can set a new password here.
              </Text>
            </View>
          )}

          {/* [AUTH RESET UI] Form */}
          <View style={styles.form}>
            {/* [AUTH RESET UI] New password field */}
            <Text style={styles.label}>New Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color="rgba(10, 118, 10, 1)" />

              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor="rgba(113, 122, 109, 1)"
                value={newPassword}
                onChangeText={setNewPassword}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showNewPassword}
                editable={linkReady && !loading}
              />

              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showNewPassword ? "eye-off" : "eye"}
                  size={18}
                  color="rgba(113, 122, 109, 1)"
                />
              </TouchableOpacity>
            </View>

            {/* [AUTH RESET UI] Confirm password field */}
            <Text style={styles.label}>Confirm Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color="rgba(10, 118, 10, 1)" />

              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor="rgba(113, 122, 109, 1)"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showConfirmPassword}
                editable={linkReady && !loading}
              />

              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off" : "eye"}
                  size={18}
                  color="rgba(113, 122, 109, 1)"
                />
              </TouchableOpacity>
            </View>

            {/* [AUTH RESET UI] Update Password button */}
            <TouchableOpacity
              style={[
                styles.resetButton,
                (loading || !linkReady) && styles.disabledButton,
              ]}
              onPress={handleUpdatePassword}
              disabled={loading || !linkReady}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="rgba(255, 255, 255, 1)" />
              ) : (
                <Text style={styles.resetButtonText}>Update Password</Text>
              )}
            </TouchableOpacity>

            {/* [AUTH RESET UI] Back to Log In link */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={async () => {
                await markPasswordRecoveryActive(false);
                router.replace("/auth/login");
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.loginText}>Back to Log In</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

// ===== [AUTH RESET] Styles =====
const styles = StyleSheet.create({
  // --- Layout & loading ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  scroll: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 31,
    paddingTop: 12,
    paddingBottom: 30,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginTop: 12,
  },

  // --- Header: back button, logo, title ---
  backButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231, 245, 219, 1)",
    marginBottom: 4,
  },

  logo: {
    width: 150,
    height: 95,
    marginTop: 6,
    marginBottom: 8,
  },

  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(231, 245, 219, 1)",
    borderWidth: 1,
    borderColor: "rgba(10, 118, 10, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 20,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: "rgba(10, 118, 10, 1)",
    textAlign: "center",
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    width: 300,
    textAlign: "center",
    fontSize: 12,
    color: "rgba(65, 73, 62, 1)",
    lineHeight: 18,
    marginTop: 8,
  },

  // --- Warning box ---
  warningBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 242, 242, 1)",
    borderWidth: 1,
    borderColor: "rgba(215, 25, 32, 1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 22,
  },

  warningText: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    fontSize: 12,
    color: "rgba(215, 25, 32, 1)",
    lineHeight: 17,
    marginLeft: 8,
  },

  // --- Form, inputs & buttons ---
  form: {
    width: "100%",
    marginTop: 26,
  },

  label: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginBottom: 6,
    marginTop: 8,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(180, 180, 180, 1)",
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: "rgba(255, 255, 255, 1)",
    marginBottom: 12,
  },

  input: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginLeft: 8,
  },

  resetButton: {
    backgroundColor: "rgba(10, 118, 10, 1)",
    borderRadius: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },

  disabledButton: {
    opacity: 0.7,
  },

  resetButtonText: {
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(255, 255, 255, 1)",
    fontSize: 16,
  },

  loginButton: {
    alignSelf: "center",
    marginTop: 18,
  },

  loginText: {
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(10, 118, 10, 1)",
    fontSize: 14,
  },
});

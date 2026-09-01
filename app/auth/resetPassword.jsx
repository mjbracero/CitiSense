import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
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

const logo = require("../../assets/images/logowname.png");

const GREEN = "#0A760A";
const LIGHT_GREEN = "#E7F5DB";
const TEXT = "#41493E";
const MUTED = "#717A6D";
const BORDER = "#B4B4B4";
const RED = "#D71920";
const WHITE = "#FFFFFF";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkReady, setLinkReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

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
        Alert.alert(
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
        Alert.alert(
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

  if (!fontsLoaded) return null;

  const handleUpdatePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert(
        "Missing Fields",
        "Please enter and confirm your new password."
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Password Mismatch", "Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      let session = (await supabase.auth.getSession()).data?.session;

      if (!session) {
        session = await waitForRecoverySession({ attempts: 4, delayMs: 300 });
      }

      if (!session) {
        Alert.alert(
          "Invalid Reset Session",
          "Open the reset link from your email on this phone first, then set your new password."
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert("Reset Failed", error.message);
        return;
      }

      await markPasswordRecoveryActive(false);
      await supabase.auth.signOut();

      Alert.alert(
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
      Alert.alert("Error", String(error?.message || error));
    } finally {
      setLoading(false);
    }
  };

  if (checkingLink) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={GREEN} />

          <Text style={styles.loadingText}>Checking reset link...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={async () => {
              await markPasswordRecoveryActive(false);
              router.replace("/auth/login");
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color={GREEN} />
          </TouchableOpacity>

          <Image source={logo} style={styles.logo} resizeMode="contain" />

          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={38} color={GREEN} />
          </View>

          <Text style={styles.title}>Reset Password</Text>

          <Text style={styles.subtitle}>
            Create a new password for your CitiSense account.
          </Text>

          {!linkReady && (
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={RED} />

              <Text style={styles.warningText}>
                Open the reset link from your email on this phone first. After
                the app opens from that link, you can set a new password here.
              </Text>
            </View>
          )}

          <View style={styles.form}>
            <Text style={styles.label}>New Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color={GREEN} />

              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor={MUTED}
                value={newPassword}
                onChangeText={setNewPassword}
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
                  color={MUTED}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Confirm Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color={GREEN} />

              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={MUTED}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
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
                  color={MUTED}
                />
              </TouchableOpacity>
            </View>

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
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={styles.resetButtonText}>Update Password</Text>
              )}
            </TouchableOpacity>

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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WHITE,
  },

  keyboardView: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 31,
    paddingTop: 12,
    paddingBottom: 30,
    backgroundColor: WHITE,
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: TEXT,
    marginTop: 12,
  },

  backButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LIGHT_GREEN,
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
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 20,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 30,
    color: GREEN,
    textAlign: "center",
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    width: 300,
    textAlign: "center",
    fontSize: 12,
    color: TEXT,
    lineHeight: 18,
    marginTop: 8,
  },

  warningBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFF2F2",
    borderWidth: 1,
    borderColor: RED,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 22,
  },

  warningText: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    fontSize: 12,
    color: RED,
    lineHeight: 17,
    marginLeft: 8,
  },

  form: {
    width: "100%",
    marginTop: 26,
  },

  label: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: TEXT,
    marginBottom: 6,
    marginTop: 8,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: WHITE,
    marginBottom: 12,
  },

  input: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: TEXT,
    marginLeft: 8,
  },

  resetButton: {
    backgroundColor: GREEN,
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
    color: WHITE,
    fontSize: 16,
  },

  loginButton: {
    alignSelf: "center",
    marginTop: 18,
  },

  loginText: {
    fontFamily: "Poppins_600SemiBold",
    color: GREEN,
    fontSize: 14,
  },
});

import {
  useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { markPasswordRecoveryActive } from "../../lib/passwordReset";
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";
import { AuthLogoStage, AuthScreenBackground } from "../../components/AuthScreenChrome";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import { writeAuditLog } from "../../lib/auditLogService";
import { setPageCacheUser, hydratePageCache } from "../../lib/pageDataCache";
import { saveLastRoute } from "../../lib/navigationPersistence";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

// ===== [AUTH LOGIN] Login screen component =====
export default function LoginScreen() {
  // --- [AUTH LOGIN] State, refs & keyboard ---
  const router = useRouter();
  const { confirmed } = useLocalSearchParams();
  const shownEmailConfirmedRef = useRef(false);
  const { keyboardHeight } = useKeyboardInset();
  const isKeyboardOpen = keyboardHeight > 0;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // --- [AUTH LOGIN] Fonts ---
  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [AUTH LOGIN] "Email confirmed" toast from deep link ---
  useEffect(() => {
    if (confirmed === "1" && !shownEmailConfirmedRef.current) {
      shownEmailConfirmedRef.current = true;
      notify(
        "Email confirmed",
        "Your email is verified. Please log in with your password."
      );
    }
  }, [confirmed]);

  // --- [AUTH LOGIN] Login handler: auth, profile/ban check, role routing, audit ---
  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      notify("Missing fields", "Please enter email and password.");
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (authError) {
        console.log("Supabase auth error:", authError);

        if (/ban/i.test(authError.message || "")) {
          notify(
            "Account banned",
            "This account has been banned by an administrator."
          );
          return;
        }

        notify("Login failed", authError.message);
        return;
      }

      if (!authData?.user?.id) {
        notify("Login failed", "User account was not found.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, email, banned_at")
        .eq("id", authData.user.id)
        .single();

      if (profileError) {
        console.log("Profile fetch error:", profileError);
        notify("Login failed", profileError.message);
        return;
      }

      if (!profile) {
        notify("Login failed", "User profile not found.");
        return;
      }

      if (profile.banned_at) {
        await supabase.auth.signOut();
        notify(
          "Account banned",
          "This account has been banned by an administrator."
        );
        return;
      }

      await markPasswordRecoveryActive(false);

      setPageCacheUser(profile.id);
      await hydratePageCache(profile.id);

      const roleKey =
        profile.role === "citizen"
          ? "citizen"
          : profile.role === "moderator" || profile.role === "departmentHead"
            ? "departmentHead"
            : profile.role === "admin"
              ? "admin"
              : null;

      const homeRoute =
        profile.role === "citizen"
          ? "/citizen/dashboard"
          : profile.role === "moderator" || profile.role === "departmentHead"
            ? "/departmentHead/dashboard"
            : profile.role === "admin"
              ? "/admin/dashboard"
              : null;

      if (!homeRoute) {
        notify("Login failed", "Unknown user role.");
        return;
      }

      if (roleKey) {
        await saveLastRoute(profile.id, roleKey, homeRoute);
      }

      router.replace(homeRoute);

      void writeAuditLog({
        action: "login",
        title: "Signed In",
        description: `Signed in as ${
          profile.role === "moderator" ? "department head" : profile.role
        }.`,
        actorRole: profile.role,
        actorName: profile.email || cleanEmail,
      });

      void registerPushTokenForCurrentUser();
    } catch (err) {
      console.log("Unexpected login error:", err);
      notify("Error", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // --- [AUTH LOGIN] Navigation handlers ---
  const handleForgotPassword = () => {
    router.push("/auth/forgotPassword");
  };

  // --- [AUTH LOGIN] Render ---
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      {/* [AUTH LOGIN UI] Background */}
      <AuthScreenBackground />

      {/* [AUTH LOGIN UI] Keyboard-aware scroll container */}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          isKeyboardOpen && styles.containerKeyboardOpen,
        ]}
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
          {/* [AUTH LOGIN UI] Logo */}
          <AuthLogoStage />

          {/* [AUTH LOGIN UI] Title & subtitle */}
          <Animated.Text
            entering={FadeInDown.delay(120).duration(520)}
            style={[styles.welcomeTitle, { fontFamily: "Poppins_700Bold" }]}
          >
            Welcome Back
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(180).duration(520)}
            style={[styles.subtitle, { fontFamily: "Poppins_400Regular" }]}
          >
            Sign in to continue improving our community together.
          </Animated.Text>

          {/* [AUTH LOGIN UI] Login form card */}
          <Animated.View
            entering={FadeInUp.delay(260).duration(560)}
            style={styles.form}
          >
            {/* [AUTH LOGIN UI] Email field */}
            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Email
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color="rgba(10, 118, 10, 1)" />

              <TextInput
                style={[styles.input, { fontFamily: "Poppins_400Regular" }]}
                placeholder="Enter your email"
                placeholderTextColor="rgba(113, 122, 109, 1)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* [AUTH LOGIN UI] Password field with show/hide toggle */}
            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Password
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color="rgba(10, 118, 10, 1)" />

              <TextInput
                style={[
                  styles.input,
                  {
                    fontFamily: "Poppins_400Regular",
                    paddingRight: 38,
                  },
                ]}
                placeholder="Enter your password"
                placeholderTextColor="rgba(113, 122, 109, 1)"
                value={password}
                onChangeText={setPassword}
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showPassword}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color="rgba(113, 122, 109, 1)"
                />
              </TouchableOpacity>
            </View>

            {/* [AUTH LOGIN UI] Forgot password link */}
            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={handleForgotPassword}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.forgotPasswordText,
                  { fontFamily: "Poppins_600SemiBold" },
                ]}
              >
                Forgot Password?
              </Text>
            </TouchableOpacity>

            {/* [AUTH LOGIN UI] Log In button */}
          <TouchableOpacity
              style={[styles.loginButton, loading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="rgba(255, 255, 255, 1)" />
              ) : (
                <Text
                  style={[
                    styles.loginButtonText,
                    { fontFamily: "Poppins_600SemiBold" },
                  ]}
                >
                  Log In
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* [AUTH LOGIN UI] "Register" link footer */}
          <Animated.View
            entering={FadeIn.delay(420).duration(500)}
            style={styles.registerContainer}
          >
            <Text style={{ fontFamily: "Poppins_400Regular", color: "rgba(65, 73, 62, 1)" }}>
              Don&apos;t have an account?{" "}
            </Text>

            <TouchableOpacity onPress={() => router.push("/auth/signup")}>
              <Text
                style={{
                  fontFamily: "Poppins_700Bold",
                  color: "rgba(10, 118, 10, 1)",
                }}
              >
                Register
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

// ===== [AUTH LOGIN] Styles =====
const styles = StyleSheet.create({
  // --- Layout ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(243, 250, 241, 1)",
  },

  scroll: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 31,
    paddingTop: 28,
    paddingBottom: 40,
  },

  containerKeyboardOpen: {
    justifyContent: "flex-start",
    paddingTop: 16,
    paddingBottom: 16,
  },

  // --- Title & subtitle ---
  welcomeTitle: {
    width: 280,
    textAlign: "center",
    fontSize: 24,
    color: "rgba(10, 118, 10, 1)",
    marginTop: 4,
  },

  subtitle: {
    width: 280,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 8,
  },

  // --- Form & inputs ---
  form: {
    width: "100%",
    marginTop: 28,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220, 232, 214, 1)",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },

  label: {
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
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 12,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginLeft: 8,
  },

  eyeButton: {
    position: "absolute",
    right: 10,
  },

  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginTop: 2,
    marginBottom: 22,
  },

  forgotPasswordText: {
    fontSize: 13,
    color: "rgba(10, 118, 10, 1)",
  },

  // --- Buttons & footer ---
  loginButton: {
    backgroundColor: "rgba(10, 118, 10, 1)",
    borderRadius: 50,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },

  disabledButton: {
    opacity: 0.7,
  },

  loginButtonText: {
    color: "rgba(255, 255, 255, 1)",
    fontSize: 16,
  },

  registerContainer: {
    flexDirection: "row",
    marginTop: 28,
    alignItems: "center",
  },
});

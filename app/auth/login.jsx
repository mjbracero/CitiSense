import {
  useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { markPasswordRecoveryActive } from "../../lib/passwordReset";
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";
import {
  AuthLogoStage,
  AuthScreenBackground,
  AUTH_BG_TOP,
  AUTH_GREEN,
} from "../../components/AuthScreenChrome";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
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

export default function LoginScreen() {
  const router = useRouter();
  const { confirmed } = useLocalSearchParams();
  const shownEmailConfirmedRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    if (confirmed === "1" && !shownEmailConfirmedRef.current) {
      shownEmailConfirmedRef.current = true;
      notify(
        "Email confirmed",
        "Your email is verified. Please log in with your password."
      );
    }
  }, [confirmed]);

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

  const handleForgotPassword = () => {
    router.push("/auth/forgotPassword");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <AuthScreenBackground />

      <KeyboardAwareScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <AuthLogoStage />

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

          <Animated.View
            entering={FadeInUp.delay(260).duration(560)}
            style={styles.form}
          >
            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Email
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color={AUTH_GREEN} />

              <TextInput
                style={[styles.input, { fontFamily: "Poppins_400Regular" }]}
                placeholder="Enter your email"
                placeholderTextColor="#717A6D"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Password
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color={AUTH_GREEN} />

              <TextInput
                style={[
                  styles.input,
                  {
                    fontFamily: "Poppins_400Regular",
                    paddingRight: 38,
                  },
                ]}
                placeholder="Enter your password"
                placeholderTextColor="#717A6D"
                value={password}
                onChangeText={setPassword}
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
                  color="#717A6D"
                />
              </TouchableOpacity>
            </View>

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

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
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

          <Animated.View
            entering={FadeIn.delay(420).duration(500)}
            style={styles.registerContainer}
          >
            <Text style={{ fontFamily: "Poppins_400Regular", color: "#41493E" }}>
              Don&apos;t have an account?{" "}
            </Text>

            <TouchableOpacity onPress={() => router.push("/auth/signup")}>
              <Text
                style={{
                  fontFamily: "Poppins_700Bold",
                  color: AUTH_GREEN,
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: AUTH_BG_TOP,
  },

  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 31,
    paddingTop: 28,
    paddingBottom: 40,
  },

  welcomeTitle: {
    width: 280,
    textAlign: "center",
    fontSize: 24,
    color: AUTH_GREEN,
    marginTop: 4,
  },

  subtitle: {
    width: 280,
    textAlign: "center",
    fontSize: 13,
    color: "#41493E",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 8,
  },

  form: {
    width: "100%",
    marginTop: 28,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DCE8D6",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },

  label: {
    fontSize: 13,
    color: "#41493E",
    marginBottom: 6,
    marginTop: 8,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B4B4B4",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 50,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "#41493E",
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
    color: AUTH_GREEN,
  },

  loginButton: {
    backgroundColor: AUTH_GREEN,
    borderRadius: 50,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
  },

  disabledButton: {
    opacity: 0.7,
  },

  loginButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
  },

  registerContainer: {
    flexDirection: "row",
    marginTop: 28,
    alignItems: "center",
  },
});

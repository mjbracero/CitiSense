import {
  useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPasswordResetRedirectTo } from "../../lib/passwordReset";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import { PageSkeleton } from "../../components/skeletons";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

// ===== [AUTH FORGOT] Assets =====
const logo = require("../../assets/images/logowname.png");

// ===== [AUTH FORGOT] Forgot password screen component =====
export default function ForgotPasswordScreen() {
  // --- [AUTH FORGOT] State ---
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // --- [AUTH FORGOT] Fonts (skeleton until loaded) ---
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return <PageSkeleton variant="auth" />;

  // --- [AUTH FORGOT] Send reset link handler ---
  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      notify("Missing Email", "Please enter your registered email.");
      return;
    }

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      notify("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const redirectTo = getPasswordResetRedirectTo();

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        notify("Reset Failed", error.message);
        return;
      }

      setEmailSent(true);

      notify(
        "Password Reset Sent",
        "Check your email and tap the reset link on this phone. It must open CitiSense (not only a browser) before you can set a new password."
      );
    } catch (err) {
      notify("Error", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // --- [AUTH FORGOT] Render ---
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* [AUTH FORGOT UI] Keyboard-aware scroll container */}
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
          {/* [AUTH FORGOT UI] Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="rgba(10, 118, 10, 1)" />
          </TouchableOpacity>

          {/* [AUTH FORGOT UI] Logo, title & subtitle */}
          <Image source={logo} style={styles.logo} resizeMode="contain" />

          <Text
            style={[
              styles.title,
              {
                fontFamily: "Poppins_700Bold",
              },
            ]}
          >
            Forgot Password?
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                fontFamily: "Poppins_400Regular",
              },
            ]}
          >
            Enter your registered email address and we’ll send you a link to
            reset your password.
          </Text>

          {/* [AUTH FORGOT UI] Form */}
          <View style={styles.form}>
            {/* [AUTH FORGOT UI] Email field */}
            <Text
              style={[
                styles.label,
                {
                  fontFamily: "Poppins_600SemiBold",
                },
              ]}
            >
              Email Address
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color="rgba(10, 118, 10, 1)" />

              <TextInput
                style={[
                  styles.input,
                  {
                    fontFamily: "Poppins_400Regular",
                  },
                ]}
                placeholder="Enter your registered email"
                placeholderTextColor="rgba(113, 122, 109, 1)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* [AUTH FORGOT UI] "Reset link sent" success box */}
            {emailSent && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={20} color="rgba(10, 118, 10, 1)" />

                <Text
                  style={[
                    styles.successText,
                    {
                      fontFamily: "Poppins_500Medium",
                    },
                  ]}
                >
                  Reset link sent. Open it on this phone to continue.
                </Text>
              </View>
            )}

            {/* [AUTH FORGOT UI] Send Reset Link button */}
            <TouchableOpacity
              style={[styles.resetButton, loading && styles.disabledButton]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="rgba(255, 255, 255, 1)" />
              ) : (
                <Text
                  style={[
                    styles.resetButtonText,
                    {
                      fontFamily: "Poppins_600SemiBold",
                    },
                  ]}
                >
                  Send Reset Link
                </Text>
              )}
            </TouchableOpacity>

            {/* [AUTH FORGOT UI] Back to Log In link */}
            <TouchableOpacity
              style={styles.loginButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.loginText,
                  {
                    fontFamily: "Poppins_600SemiBold",
                  },
                ]}
              >
                Back to Log In
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

// ===== [AUTH FORGOT] Styles =====
const styles = StyleSheet.create({
  // --- Layout & header ---
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
  },

  backButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(231, 245, 219, 1)",
    marginBottom: 8,
  },

  logo: {
    width: 165,
    height: 165,
    marginTop: 4,
  },

  title: {
    fontSize: 28,
    color: "rgba(10, 118, 10, 1)",
    textAlign: "center",
    marginTop: 4,
  },

  subtitle: {
    width: 300,
    textAlign: "center",
    fontSize: 12,
    color: "rgba(65, 73, 62, 1)",
    lineHeight: 18,
    marginTop: 8,
  },

  // --- Form, success box & buttons ---
  form: {
    width: "100%",
    marginTop: 30,
  },

  label: {
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginBottom: 6,
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
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "rgba(65, 73, 62, 1)",
    marginLeft: 8,
  },

  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(231, 245, 219, 1)",
    borderWidth: 1,
    borderColor: "rgba(10, 118, 10, 1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },

  successText: {
    flex: 1,
    fontSize: 12,
    color: "rgba(10, 118, 10, 1)",
    marginLeft: 8,
    lineHeight: 17,
  },

  resetButton: {
    backgroundColor: "rgba(10, 118, 10, 1)",
    borderRadius: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },

  disabledButton: {
    opacity: 0.7,
  },

  resetButtonText: {
    color: "rgba(255, 255, 255, 1)",
    fontSize: 16,
  },

  loginButton: {
    alignSelf: "center",
    marginTop: 18,
  },

  loginText: {
    color: "rgba(10, 118, 10, 1)",
    fontSize: 14,
  },
});

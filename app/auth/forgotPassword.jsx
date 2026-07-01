import { useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

const logo = require("../../assets/images/logowname.png");

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("Missing Email", "Please enter your registered email.");
      return;
    }

    if (!cleanEmail.includes("@")) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: "citisense://auth/resetPassword",
      });

      if (error) {
        Alert.alert("Reset Failed", error.message);
        return;
      }

      setEmailSent(true);

      Alert.alert(
        "Password Reset Sent",
        "Please check your email for the password reset link."
      );
    } catch (err) {
      Alert.alert("Error", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

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
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#0A760A" />
          </TouchableOpacity>

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

          <View style={styles.form}>
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
              <Ionicons name="mail" size={18} color="#0A760A" />

              <TextInput
                style={[
                  styles.input,
                  {
                    fontFamily: "Poppins_400Regular",
                  },
                ]}
                placeholder="Enter your registered email"
                placeholderTextColor="#717A6D"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {emailSent && (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={20} color="#0A760A" />

                <Text
                  style={[
                    styles.successText,
                    {
                      fontFamily: "Poppins_500Medium",
                    },
                  ]}
                >
                  Reset link sent. Please check your email inbox.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.resetButton, loading && styles.disabledButton]}
              onPress={handleResetPassword}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
  },

  backButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F5DB",
    marginBottom: 8,
  },

  logo: {
    width: 165,
    height: 165,
    marginTop: 4,
  },

  title: {
    fontSize: 28,
    color: "#0A760A",
    textAlign: "center",
    marginTop: 4,
  },

  subtitle: {
    width: 300,
    textAlign: "center",
    fontSize: 12,
    color: "#41493E",
    lineHeight: 18,
    marginTop: 8,
  },

  form: {
    width: "100%",
    marginTop: 30,
  },

  label: {
    fontSize: 13,
    color: "#41493E",
    marginBottom: 6,
  },

  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#B4B4B4",
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: "#FFFFFF",
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "#41493E",
    marginLeft: 8,
  },

  successBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E7F5DB",
    borderWidth: 1,
    borderColor: "#0A760A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 14,
  },

  successText: {
    flex: 1,
    fontSize: 12,
    color: "#0A760A",
    marginLeft: 8,
    lineHeight: 17,
  },

  resetButton: {
    backgroundColor: "#0A760A",
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
    color: "#FFFFFF",
    fontSize: 16,
  },

  loginButton: {
    alignSelf: "center",
    marginTop: 18,
  },

  loginText: {
    color: "#0A760A",
    fontSize: 14,
  },
});
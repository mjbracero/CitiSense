import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { writeAuditLog } from "../../lib/auditLogService";
import {
  AuthScreenBackground,
  AUTH_BG_TOP,
  AUTH_GREEN,
} from "../../components/AuthScreenChrome";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import { PageSkeleton } from "../../components/skeletons";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

const barangays = [
  "Anonang Norte",
  "Anonang Sur",
  "Banban",
  "Binabag",
  "Bungtod",
  "Carbon",
  "Cayang",
  "Cogon",
  "Dakit",
  "Don Pedro Rodriguez",
  "Gairan",
  "Guadalupe",
  "La Paz",
  "La Purisima Concepcion",
  "Libertad",
  "Lourdes",
  "Malingin",
  "Marangog",
  "Nailon",
  "Odlot",
  "Pandan",
  "Polambato",
  "Sambag",
  "San Vicente",
  "Santo Niño",
  "Santo Rosario",
  "Siocon",
  "Sudlonon",
  "Taytayan",
];

const EMAIL_REDIRECT_URL = "citisense://auth/login";

export default function SignupScreen() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    fullName: "",
    contactNumber: "",
    barangay: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showBarangayDropdown, setShowBarangayDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return <PageSkeleton variant="auth" />;

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateContactNumber = (value) => {
    const numbersOnly = value.replace(/[^0-9]/g, "");
    updateField("contactNumber", numbersOnly);
  };

  const selectBarangay = (barangay) => {
    updateField("barangay", barangay);
    setShowBarangayDropdown(false);
  };

  const contactNumberHasWarning =
    formData.contactNumber.length > 0 && formData.contactNumber.length !== 11;

  const validateForm = () => {
    const {
      fullName,
      contactNumber,
      barangay,
      email,
      password,
      confirmPassword,
    } = formData;

    if (
      !fullName.trim() ||
      !contactNumber.trim() ||
      !barangay.trim() ||
      !email.trim() ||
      !password.trim() ||
      !confirmPassword.trim()
    ) {
      notify("Missing fields", "Please complete all required fields.");
      return false;
    }

    if (!email.includes("@") || !email.includes(".")) {
      notify("Invalid email", "Please enter a valid email address.");
      return false;
    }

    if (!/^\d{11}$/.test(contactNumber.trim())) {
      notify(
        "Invalid contact number",
        "Contact number must be exactly 11 digits."
      );
      return false;
    }

    if (password.length < 6) {
      notify("Weak password", "Password must be at least 6 characters.");
      return false;
    }

    if (password !== confirmPassword) {
      notify(
        "Password mismatch",
        "Password and confirm password do not match."
      );
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const cleanEmail = formData.email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: formData.password,
        options: {
          emailRedirectTo: EMAIL_REDIRECT_URL,
          data: {
            full_name: formData.fullName.trim(),
            contact_number: formData.contactNumber.trim(),
            barangay: formData.barangay.trim(),
            role: "citizen",
          },
        },
      });

      console.log("Signup result:", data, error);

      if (error) {
        notify("Signup failed", error.message);
        return;
      }

      if (!data?.user) {
        notify("Signup failed", "User account was not created.");
        return;
      }

      notify(
        "Success",
        "Account created successfully. You can now log in.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/auth/login"),
          },
        ]
      );

      writeAuditLog({
        action: "signup",
        title: "Account Created",
        description: "A new citizen account was created.",
        actorRole: "citizen",
        actorName: formData.fullName.trim(),
      });
    } catch (error) {
      console.log("Signup unexpected error:", error);
      notify("Signup error", String(error?.message || error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <AuthScreenBackground />

      <KeyboardAwareScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <Animated.Text
            entering={FadeInDown.delay(160).duration(520)}
            style={[styles.title, { fontFamily: "Poppins_700Bold" }]}
          >
            Create Your Account
          </Animated.Text>

          <Animated.Text
            entering={FadeInDown.delay(200).duration(520)}
            style={[styles.subtitle, { fontFamily: "Poppins_400Regular" }]}
          >
            Join CitiSense and help make our community better for everyone.
          </Animated.Text>

          <Animated.View
            entering={FadeInUp.delay(260).duration(560)}
            style={styles.form}
          >
            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Full Name
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="person" size={18} color={AUTH_GREEN} />

              <TextInput
                value={formData.fullName}
                onChangeText={(text) => updateField("fullName", text)}
                placeholder="Juan Dela Cruz"
                placeholderTextColor="#717A6D"
                style={[styles.input, { fontFamily: "Poppins_400Regular" }]}
              />
            </View>

            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Contact Number
            </Text>

            <View
              style={[
                styles.inputWrapper,
                contactNumberHasWarning && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="call"
                size={18}
                color={contactNumberHasWarning ? "#D71920" : AUTH_GREEN}
              />

              <TextInput
                value={formData.contactNumber}
                onChangeText={updateContactNumber}
                placeholder="09XX XXX XXXX"
                placeholderTextColor="#717A6D"
                style={[styles.input, { fontFamily: "Poppins_400Regular" }]}
                keyboardType="number-pad"
                maxLength={11}
              />
            </View>

            {contactNumberHasWarning && (
              <Text
                style={[
                  styles.contactWarningText,
                  { fontFamily: "Poppins_400Regular" },
                ]}
              >
                Contact number must be exactly 11 digits.
              </Text>
            )}

            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Barangay
            </Text>

            <TouchableOpacity
              style={styles.inputWrapper}
              activeOpacity={0.8}
              onPress={() => setShowBarangayDropdown(true)}
            >
              <Ionicons name="location" size={18} color={AUTH_GREEN} />

              <Text
                style={[
                  styles.dropdownText,
                  { fontFamily: "Poppins_400Regular" },
                  !formData.barangay && styles.placeholderText,
                ]}
              >
                {formData.barangay || "Select your barangay"}
              </Text>

              <Ionicons name="chevron-down" size={16} color="#717A6D" />
            </TouchableOpacity>

            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Email Address
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color={AUTH_GREEN} />

              <TextInput
                value={formData.email}
                onChangeText={(text) => updateField("email", text)}
                placeholder="juandelacruz@gmail.com"
                placeholderTextColor="#717A6D"
                style={[styles.input, { fontFamily: "Poppins_400Regular" }]}
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
                value={formData.password}
                onChangeText={(text) => updateField("password", text)}
                placeholder="Enter your password"
                placeholderTextColor="#717A6D"
                style={[
                  styles.input,
                  { fontFamily: "Poppins_400Regular", paddingRight: 38 },
                ]}
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

            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Confirm Password
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={18} color={AUTH_GREEN} />

              <TextInput
                value={formData.confirmPassword}
                onChangeText={(text) => updateField("confirmPassword", text)}
                placeholder="Confirm your password"
                placeholderTextColor="#717A6D"
                style={[
                  styles.input,
                  { fontFamily: "Poppins_400Regular", paddingRight: 38 },
                ]}
                secureTextEntry={!showConfirmPassword}
              />

              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off" : "eye"}
                  size={18}
                  color="#717A6D"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.signupButton, isLoading && styles.disabledButton]}
              onPress={handleSignup}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={[
                    styles.signupText,
                    { fontFamily: "Poppins_600SemiBold" },
                  ]}
                >
                  Sign Up
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(420).duration(500)}
            style={styles.loginContainer}
          >
            <Text style={{ fontFamily: "Poppins_400Regular", color: "#41493E" }}>
              Already have an account?{" "}
            </Text>

            <TouchableOpacity
              onPress={() => router.replace("/auth/login")}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontFamily: "Poppins_700Bold",
                  color: AUTH_GREEN,
                }}
              >
                Log In
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAwareScrollView>

      <Modal
        visible={showBarangayDropdown}
        transparent
        animationType="fade"
        statusBarTranslucent={false}
        onRequestClose={() => setShowBarangayDropdown(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowBarangayDropdown(false)}
          />

          <View style={styles.dropdownModal}>
            <View style={styles.modalHeader}>
              <Text
                style={[styles.modalTitle, { fontFamily: "Poppins_700Bold" }]}
              >
                Select Barangay
              </Text>

              <TouchableOpacity
                onPress={() => setShowBarangayDropdown(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={22} color="#41493E" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.barangayList}
              contentContainerStyle={styles.barangayListContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {barangays.map((barangay) => (
                <TouchableOpacity
                  key={barangay}
                  style={[
                    styles.barangayOption,
                    formData.barangay === barangay && styles.selectedBarangay,
                  ]}
                  onPress={() => selectBarangay(barangay)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.barangayText,
                      {
                        fontFamily:
                          formData.barangay === barangay
                            ? "Poppins_600SemiBold"
                            : "Poppins_400Regular",
                      },
                      formData.barangay === barangay &&
                        styles.selectedBarangayText,
                    ]}
                  >
                    {barangay}
                  </Text>

                  {formData.barangay === barangay && (
                    <Ionicons name="checkmark" size={18} color={AUTH_GREEN} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
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
    paddingHorizontal: 31,
    paddingTop: 28,
    paddingBottom: 40,
  },

  title: {
    width: 280,
    textAlign: "center",
    fontSize: 24,
    color: AUTH_GREEN,
    marginTop: 8,
  },

  subtitle: {
    width: 280,
    textAlign: "center",
    fontSize: 13,
    color: "#41493E",
    lineHeight: 20,
    marginTop: 10,
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

  inputWrapperError: {
    borderColor: "#D71920",
  },

  input: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "#41493E",
    marginLeft: 8,
  },

  contactWarningText: {
    fontSize: 11,
    color: "#D71920",
    marginTop: -6,
    marginBottom: 6,
  },

  dropdownText: {
    flex: 1,
    fontSize: 13,
    color: "#41493E",
    marginLeft: 8,
  },

  placeholderText: {
    color: "#717A6D",
  },

  eyeButton: {
    position: "absolute",
    right: 10,
  },

  signupButton: {
    backgroundColor: AUTH_GREEN,
    borderRadius: 50,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },

  disabledButton: {
    opacity: 0.7,
  },

  signupText: {
    fontSize: 16,
    color: "#FFFFFF",
  },

  loginContainer: {
    flexDirection: "row",
    marginTop: 28,
    alignItems: "center",
  },

  modalSafeArea: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    paddingHorizontal: 31,
  },

  modalBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  dropdownModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
    maxHeight: "75%",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  modalTitle: {
    fontSize: 16,
    color: AUTH_GREEN,
  },

  barangayList: {
    maxHeight: 430,
  },

  barangayListContent: {
    paddingBottom: 8,
  },

  barangayOption: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectedBarangay: {
    backgroundColor: "#E7F5DB",
  },

  barangayText: {
    fontSize: 13,
    color: "#41493E",
  },

  selectedBarangayText: {
    color: AUTH_GREEN,
  },
});

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";

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

  if (!fontsLoaded) return null;

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
      Alert.alert("Missing fields", "Please complete all required fields.");
      return false;
    }

    if (!email.includes("@") || !email.includes(".")) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return false;
    }

    if (!/^\d{11}$/.test(contactNumber.trim())) {
      Alert.alert(
        "Invalid contact number",
        "Contact number must be exactly 11 digits."
      );
      return false;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert(
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
        Alert.alert("Signup failed", error.message);
        return;
      }

      if (!data?.user) {
        Alert.alert("Signup failed", "User account was not created.");
        return;
      }

      Alert.alert(
        "Success",
        "Account created successfully. You can now log in as a Citizen.",
        [
          {
            text: "OK",
            onPress: () => router.replace("/auth/login"),
          },
        ]
      );
    } catch (error) {
      console.log("Signup unexpected error:", error);
      Alert.alert("Signup error", String(error?.message || error));
    } finally {
      setIsLoading(false);
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
        >
          <Text style={styles.title}>Create Your Account</Text>

          <Text style={styles.subtitle}>
            Join CitiSense and help make our community better for everyone.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="person" size={16} color="#0A760A" />

              <TextInput
                value={formData.fullName}
                onChangeText={(text) => updateField("fullName", text)}
                placeholder="Juan Dela Cruz"
                placeholderTextColor="#717A6D"
                style={styles.input}
              />
            </View>

            <Text style={styles.label}>Contact Number</Text>

            <View
              style={[
                styles.inputWrapper,
                contactNumberHasWarning && styles.inputWrapperError,
              ]}
            >
              <Ionicons
                name="call"
                size={16}
                color={contactNumberHasWarning ? "#D71920" : "#0A760A"}
              />

              <TextInput
                value={formData.contactNumber}
                onChangeText={updateContactNumber}
                placeholder="09XX XXX XXXX"
                placeholderTextColor="#717A6D"
                style={styles.input}
                keyboardType="number-pad"
                maxLength={11}
              />
            </View>

            {contactNumberHasWarning && (
              <Text style={styles.contactWarningText}>
                Contact number must be exactly 11 digits.
              </Text>
            )}

            <Text style={styles.label}>Barangay</Text>

            <TouchableOpacity
              style={styles.inputWrapper}
              activeOpacity={0.8}
              onPress={() => setShowBarangayDropdown(true)}
            >
              <Ionicons name="location" size={16} color="#0A760A" />

              <Text
                style={[
                  styles.dropdownText,
                  !formData.barangay && styles.placeholderText,
                ]}
              >
                {formData.barangay || "Select your barangay"}
              </Text>

              <Ionicons name="chevron-down" size={16} color="#717A6D" />
            </TouchableOpacity>

            <Text style={styles.label}>Email Address</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={16} color="#0A760A" />

              <TextInput
                value={formData.email}
                onChangeText={(text) => updateField("email", text)}
                placeholder="juandelacruz@gmail.com"
                placeholderTextColor="#717A6D"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={16} color="#0A760A" />

              <TextInput
                value={formData.password}
                onChangeText={(text) => updateField("password", text)}
                placeholder="Enter your password"
                placeholderTextColor="#717A6D"
                style={styles.input}
                secureTextEntry={!showPassword}
              />

              <TouchableOpacity
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

            <Text style={styles.label}>Confirm Password</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed" size={16} color="#0A760A" />

              <TextInput
                value={formData.confirmPassword}
                onChangeText={(text) => updateField("confirmPassword", text)}
                placeholder="Confirm your password"
                placeholderTextColor="#717A6D"
                style={styles.input}
                secureTextEntry={!showConfirmPassword}
              />

              <TouchableOpacity
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
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.signupText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            <View style={styles.loginContainer}>
              <Text style={styles.loginText}>Already have an account? </Text>

              <TouchableOpacity
                onPress={() => router.replace("/auth/login")}
                activeOpacity={0.7}
              >
                <Text style={styles.loginLink}>Log In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
              <Text style={styles.modalTitle}>Select Barangay</Text>

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
                    formData.barangay === barangay &&
                      styles.selectedBarangay,
                  ]}
                  onPress={() => selectBarangay(barangay)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.barangayText,
                      formData.barangay === barangay &&
                        styles.selectedBarangayText,
                    ]}
                  >
                    {barangay}
                  </Text>

                  {formData.barangay === barangay && (
                    <Ionicons name="checkmark" size={18} color="#0A760A" />
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
    backgroundColor: "#FFFFFF",
  },

  keyboardView: {
    flex: 1,
  },

  container: {
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 31,
    paddingTop: 12,
    paddingBottom: 25,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    color: "#0A760A",
    textAlign: "center",
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#41493E",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 10,
    marginBottom: 18,
  },

  form: {
    width: "100%",
  },

  label: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "#41493E",
    marginBottom: 5,
    marginTop: 9,
  },

  inputWrapper: {
    width: "100%",
    height: 45,
    borderWidth: 1,
    borderColor: "#B4B4B4",
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    backgroundColor: "#FFFFFF",
  },

  inputWrapperError: {
    borderColor: "#D71920",
  },

  input: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: "#41493E",
    marginLeft: 10,
  },

  contactWarningText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#D71920",
    marginTop: 4,
  },

  dropdownText: {
    fontFamily: "Poppins_400Regular",
    flex: 1,
    fontSize: 13,
    color: "#41493E",
    marginLeft: 10,
  },

  placeholderText: {
    color: "#717A6D",
  },

  signupButton: {
    width: "100%",
    height: 49,
    backgroundColor: "#0A760A",
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
  },

  disabledButton: {
    opacity: 0.7,
  },

  signupText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
  },

  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 16,
    alignItems: "center",
  },

  loginText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#41493E",
  },

  loginLink: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "#0A760A",
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
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "#0A760A",
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
    fontFamily: "Poppins_400Regular",
    fontSize: 13,
    color: "#41493E",
  },

  selectedBarangayText: {
    fontFamily: "Poppins_600SemiBold",
    color: "#0A760A",
  },
});
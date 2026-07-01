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
import {
  Ionicons,
  MaterialCommunityIcons,
  FontAwesome5,
} from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";

import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";

const logo = require("../../assets/images/logowname.png");

export default function LoginScreen() {
  const router = useRouter();

  const [selectedRole, setSelectedRole] = useState("citizen");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!fontsLoaded) return null;

  const roles = [
    {
      id: "citizen",
      label: "Citizen",
      icon: ({ size, color }) => (
        <Ionicons name="people" size={size} color={color} />
      ),
    },
    {
      id: "departmentHead",
      label: "Department Head",
      icon: ({ size, color }) => (
        <MaterialCommunityIcons name="account-check" size={size} color={color} />
      ),
    },
    {
      id: "admin",
      label: "Admin",
      icon: ({ size, color }) => (
        <FontAwesome5 name="user-shield" size={size} color={color} />
      ),
    },
  ];

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Missing fields", "Please enter email and password.");
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
        Alert.alert("Login failed", authError.message);
        return;
      }

      if (!authData?.user?.id) {
        Alert.alert("Login failed", "User account was not found.");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, email")
        .eq("id", authData.user.id)
        .single();

      if (profileError) {
        console.log("Profile fetch error:", profileError);
        Alert.alert("Login failed", profileError.message);
        return;
      }

      if (!profile) {
        Alert.alert("Login failed", "User profile not found.");
        return;
      }

      if (profile.role !== selectedRole && !(selectedRole === "departmentHead" && profile.role === "moderator")) {
        const displayRole =
          profile.role === "moderator" ? "department head" : profile.role;

        Alert.alert(
          "Role mismatch",
          `This account is registered as ${displayRole}. Please select the correct role.`
        );
        return;
      }

      if (profile.role === "citizen") {
        await registerPushTokenForCurrentUser();
        router.replace("/citizen/dashboard");
      } else if (profile.role === "moderator" || profile.role === "departmentHead") {
        await registerPushTokenForCurrentUser();
        router.replace("/departmentHead/dashboard");
      } else if (profile.role === "admin") {
        await registerPushTokenForCurrentUser();
        router.replace("/admin/dashboard");
      } else {
        Alert.alert("Login failed", "Unknown user role.");
      }
    } catch (err) {
      console.log("Unexpected login error:", err);
      Alert.alert("Error", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    router.push("/auth/forgotPassword");
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
          <Image source={logo} style={styles.logo} resizeMode="contain" />

          <Text style={[styles.subtitle, { fontFamily: "Poppins_400Regular" }]}>
            Sign in to continue improving our community together.
          </Text>

          <View style={styles.roleContainer}>
            {roles.map((role) => {
              const isSelected = selectedRole === role.id;
              const color = isSelected ? "#0A760A" : "#000000";

              return (
                <TouchableOpacity
                  key={role.id}
                  style={[styles.roleCard, isSelected && styles.activeRoleCard]}
                  onPress={() => setSelectedRole(role.id)}
                  activeOpacity={0.8}
                >
                  {role.icon({ size: 30, color })}

                  <Text
                    style={{
                      fontFamily: isSelected
                        ? "Poppins_700Bold"
                        : "Poppins_600SemiBold",
                      color,
                      fontSize: 12,
                      marginTop: 5,
                      textAlign: "center",
                      width: "100%",
                      paddingHorizontal: 4,
                    }}
                  >
                    {role.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.form}>
            <Text style={[styles.label, { fontFamily: "Poppins_600SemiBold" }]}>
              Email
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail" size={18} color="#0A760A" />

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
              <Ionicons name="lock-closed" size={18} color="#0A760A" />

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
          </View>

          <View style={styles.registerContainer}>
            <Text style={{ fontFamily: "Poppins_400Regular" }}>
              Don&apos;t have an account?{" "}
            </Text>

            <TouchableOpacity onPress={() => router.push("/auth/signup")}>
              <Text
                style={{
                  fontFamily: "Poppins_700Bold",
                  color: "#0A760A",
                }}
              >
                Register
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

  logo: {
    width: 180,
    height: 180,
    marginTop: 4,
  },

  subtitle: {
    width: 270,
    textAlign: "center",
    fontSize: 12,
    color: "#41493E",
    lineHeight: 17,
    marginTop: 5,
  },

  roleContainer: {
    width: "100%",
    height: 79,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    borderRadius: 8,
    flexDirection: "row",
    marginTop: 24,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },

  roleCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  activeRoleCard: {
    backgroundColor: "#E7F5DB",
    borderWidth: 1,
    borderColor: "#0A760A",
    borderRadius: 8,
  },

  form: {
    width: "100%",
    marginTop: 16,
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
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 12,
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
    marginTop: -2,
    marginBottom: 18,
  },

  forgotPasswordText: {
    fontSize: 13,
    color: "#0A760A",
  },

  loginButton: {
    backgroundColor: "#0A760A",
    borderRadius: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 0,
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
    marginTop: 16,
    alignItems: "center",
  },
});
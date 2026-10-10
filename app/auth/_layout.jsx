import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";

// ===== [AUTH LAYOUT] Auth stack layout (login, signup, forgot/reset password) =====
export default function AuthLayout() {
  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },
});

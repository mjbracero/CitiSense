import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useRoleLayoutBootstrap from "../../hooks/useRoleLayoutBootstrap";

// ===== [CITIZEN LAYOUT] Router settings: default route =====
export const unstable_settings = {
  initialRouteName: "dashboard",
};

// ===== [CITIZEN LAYOUT] Layout component =====
export default function CitizenLayout() {
  // --- [CITIZEN LAYOUT] Role bootstrap (session/profile ready gate) ---
  const ready = useRoleLayoutBootstrap("citizen");

  if (!ready) {
    return <View style={styles.container} />;
  }
  // --- [CITIZEN LAYOUT] Render ---
  return (
    <View style={styles.container}>
      {/* [CITIZEN LAYOUT UI] Screen stack (no headers, no animation) */}
      <View style={styles.stack}>
        <Stack
          detachInactiveScreens={false}
          screenOptions={{
            headerShown: false,
            animation: "none",
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
      </View>
      {/* [CITIZEN LAYOUT UI] Persistent bottom navigation */}
      <PersistentBottomNav role="citizen" />
    </View>
  );
}

// ===== [CITIZEN LAYOUT] Styles =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },
  stack: {
    flex: 1,
  },
});

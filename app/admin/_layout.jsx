import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";
import useRoleLayoutBootstrap from "../../hooks/useRoleLayoutBootstrap";

// ===== [ADMIN LAYOUT] Router settings =====
export const unstable_settings = {
  initialRouteName: "dashboard",
};

// ===== [ADMIN LAYOUT] Layout component =====
export default function AdminLayout() {
  // --- [ADMIN LAYOUT] Unread badge count & role bootstrap ---
  const { unreadNotificationCount } = useAdminUnreadNotifications();
  const ready = useRoleLayoutBootstrap("admin");

  // --- [ADMIN LAYOUT] Blank screen until role check finishes ---
  if (!ready) {
    return <View style={styles.container} />;
  }

  // --- [ADMIN LAYOUT] Render ---
  return (
    <View style={styles.container}>
      {/* [ADMIN LAYOUT UI] Screen stack (no headers/animations) */}
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
      {/* [ADMIN LAYOUT UI] Persistent bottom navigation bar */}
      <PersistentBottomNav
        role="admin"
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

// ===== [ADMIN LAYOUT] Styles =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },
  stack: {
    flex: 1,
  },
});

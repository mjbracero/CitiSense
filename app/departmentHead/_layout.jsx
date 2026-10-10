import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
import useRoleLayoutBootstrap from "../../hooks/useRoleLayoutBootstrap";

// ===== [DEPT LAYOUT] Router settings =====
export const unstable_settings = {
  initialRouteName: "dashboard",
};

// ===== [DEPT LAYOUT] Layout component =====
export default function DepartmentHeadLayout() {
  // --- [DEPT LAYOUT] Unread count & role bootstrap ---
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();
  const ready = useRoleLayoutBootstrap("departmentHead");

  if (!ready) {
    return <View style={styles.container} />;
  }

  // --- [DEPT LAYOUT] Render ---
  return (
    <View style={styles.container}>
      {/* [DEPT LAYOUT UI] Screen stack */}
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
      {/* [DEPT LAYOUT UI] Bottom navigation */}
      <PersistentBottomNav
        role="departmentHead"
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

// ===== [DEPT LAYOUT] Styles =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },
  stack: {
    flex: 1,
  },
});

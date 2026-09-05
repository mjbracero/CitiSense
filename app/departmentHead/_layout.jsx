import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { APP_BACKGROUND } from "../../lib/platformUi";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
import useRoleLayoutBootstrap from "../../hooks/useRoleLayoutBootstrap";

export default function DepartmentHeadLayout() {
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();
  const ready = useRoleLayoutBootstrap("departmentHead");

  if (!ready) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
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
      <PersistentBottomNav
        role="departmentHead"
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_BACKGROUND,
  },
  stack: {
    flex: 1,
  },
});

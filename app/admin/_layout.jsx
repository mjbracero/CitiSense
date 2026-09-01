import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";

export default function AdminLayout() {
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          animationDuration: 180,
          gestureEnabled: false,
          fullScreenGestureEnabled: false,
          freezeOnBlur: true,
        }}
      />
      <PersistentBottomNav
        role="admin"
        unreadNotificationCount={unreadNotificationCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

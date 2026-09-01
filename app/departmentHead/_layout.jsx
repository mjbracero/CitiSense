import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";

export default function DepartmentHeadLayout() {
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();

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
        role="departmentHead"
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

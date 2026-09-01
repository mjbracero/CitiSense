import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { APP_BACKGROUND } from "../../lib/platformUi";

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
    backgroundColor: APP_BACKGROUND,
  },
});

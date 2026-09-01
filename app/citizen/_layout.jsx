import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import PersistentBottomNav from "../../components/PersistentBottomNav";

export default function CitizenLayout() {
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
      <PersistentBottomNav role="citizen" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

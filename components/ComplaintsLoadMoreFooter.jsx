import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const GREEN = "#087A0D";
const MUTED = "#6F776F";

export default function ComplaintsLoadMoreFooter({
  loading = false,
  label = "Loading more complaints...",
}) {
  if (!loading) return null;

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="small" color={GREEN} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  text: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
  },
});

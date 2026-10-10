import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

// ===== [LOAD MORE FOOTER] Pagination "loading more" footer for complaint lists =====

export default function ComplaintsLoadMoreFooter({
  loading = false,
  label = "Loading more complaints...",
}) {
  if (!loading) return null;

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" />
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
    color: "rgba(111, 119, 111, 1)",
  },
});

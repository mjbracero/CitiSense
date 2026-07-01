import { Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const SOFT_RED = "#FFF0F0";

const H_PADDING = 20;

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getRoleColor(role) {
  const cleanRole = normalizeText(role);

  if (cleanRole === "admin") {
    return {
      bg: "#E8EEFF",
      color: "#315A9A",
      label: "Admin",
    };
  }

  if (cleanRole === "moderator" || cleanRole === "departmentHead") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      label: "Department Head",
    };
  }

  return {
    bg: "#F1F4F1",
    color: MUTED,
    label: "Citizen",
  };
}

function formatDate(value) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminManageUsers() {
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [currentAdminId, setCurrentAdminId] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [searchText, setSearchText] = useState("");

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const handleBack = () => {
    router.replace("/admin/dashboard");
  };

  const loadUsers = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoadingUsers(true);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setCurrentAdminId(null);
        setUsers([]);
        return;
      }

      setCurrentAdminId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, email, role, full_name, contact_number, department, avatar_url, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        Alert.alert("Load Failed", error.message);
        setUsers([]);
        return;
      }

      setUsers(data || []);
    } catch (error) {
      console.log("Load users error:", error);
      Alert.alert("Load Failed", "Unable to load users.");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUsers(true);
    }, [loadUsers])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadUsers(false);
  };

  const filteredUsers = useMemo(() => {
    const keyword = normalizeText(searchText);

    if (!keyword) return users;

    return users.filter((item) => {
      const name = normalizeText(item.full_name);
      const email = normalizeText(item.email);
      const role = normalizeText(item.role);
      const department = normalizeText(item.department);
      const contact = normalizeText(item.contact_number);

      return (
        name.includes(keyword) ||
        email.includes(keyword) ||
        role.includes(keyword) ||
        department.includes(keyword) ||
        contact.includes(keyword)
      );
    });
  }, [users, searchText]);

  const deleteUserAccount = async (targetUser) => {
    if (!targetUser?.id) return;

    if (targetUser.id === currentAdminId) {
      Alert.alert("Not Allowed", "You cannot delete your own admin account.");
      return;
    }

    try {
      setDeletingUserId(targetUser.id);

      const { data, error } = await supabase.functions.invoke(
        "admin-delete-user",
        {
          body: {
            userId: targetUser.id,
          },
        }
      );

      if (error) {
        Alert.alert("Delete Failed", error.message);
        return;
      }

      if (data?.error) {
        Alert.alert("Delete Failed", data.error);
        return;
      }

      setUsers((prev) => prev.filter((item) => item.id !== targetUser.id));

      Alert.alert("Deleted", "User account has been deleted.");
    } catch (error) {
      console.log("Delete user error:", error);
      Alert.alert("Delete Failed", "Unable to delete user account.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const confirmDeleteUser = (targetUser) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to delete ${
        targetUser.full_name || targetUser.email || "this user"
      }? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteUserAccount(targetUser),
        },
      ]
    );
  };

  const renderUser = ({ item }) => {
    const roleStyle = getRoleColor(item.role);
    const isDeleting = deletingUserId === item.id;
    const isCurrentAdmin = item.id === currentAdminId;

    return (
      <View style={styles.userCard}>
        <View style={styles.userTopRow}>
          <View style={styles.avatarBox}>
            {item.avatar_url ? (
              <Image
                source={{ uri: item.avatar_url }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons name="person" size={28} color={GREEN} />
            )}
          </View>

          <View style={styles.userMainInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.full_name || "Unnamed User"}
            </Text>

            <Text style={styles.userEmail} numberOfLines={1}>
              {item.email || "No email"}
            </Text>
          </View>

          <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleStyle.color }]}>
              {roleStyle.label}
            </Text>
          </View>
        </View>

        <View style={styles.userDetailsBox}>
          <View style={styles.detailRow}>
            <Feather name="phone" size={14} color={MUTED} />
            <Text style={styles.detailText}>
              {item.contact_number || "No contact number"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Feather name="briefcase" size={14} color={MUTED} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.department || "No department assigned"}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Feather name="calendar" size={14} color={MUTED} />
            <Text style={styles.detailText}>
              Joined {formatDate(item.created_at)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.75}
          disabled={isDeleting || isCurrentAdmin}
          style={[
            styles.deleteButton,
            (isDeleting || isCurrentAdmin) && styles.deleteButtonDisabled,
          ]}
          onPress={() => confirmDeleteUser(item)}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : (
            <>
              <Feather
                name="trash-2"
                size={17}
                color={isCurrentAdmin ? MUTED : WHITE}
              />
              <Text
                style={[
                  styles.deleteButtonText,
                  isCurrentAdmin && styles.deleteButtonTextDisabled,
                ]}
              >
                {isCurrentAdmin ? "Current Admin" : "Delete User"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View style={styles.mainContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.backButton}
            onPress={handleBack}
          >
            <Feather name="chevron-left" size={28} color={TEXT} />
          </TouchableOpacity>

          <View style={styles.headerTextBox}>
            <Text style={styles.headerTitle}>Manage Users</Text>
            <Text style={styles.headerDescription}>
              Delete user accounts when necessary.
            </Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <View style={styles.searchBox}>
            <Feather name="search" size={18} color={MUTED} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search name, email, role, department..."
              placeholderTextColor="#9A9A9A"
              style={styles.searchInput}
              autoCapitalize="none"
            />

            {searchText.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setSearchText("")}
              >
                <Feather name="x" size={18} color={MUTED} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.sectionTitle}>User Accounts</Text>
          <Text style={styles.userCount}>{filteredUsers.length} shown</Text>
        </View>

        {loadingUsers ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.loadingText}>Loading users...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={GREEN}
                colors={[GREEN]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Ionicons name="people-outline" size={40} color={MUTED} />
                <Text style={styles.emptyTitle}>No users found</Text>
                <Text style={styles.emptyText}>
                  Try searching another name, email, role, or department.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WHITE,
  },

  mainContainer: {
    flex: 1,
    backgroundColor: BG,
  },

  loader: {
    flex: 1,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },

  header: {
    minHeight: 70,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    marginTop: 0,
  },

  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "flex-start",
    justifyContent: "center",
    marginRight: 8,
  },

  headerTextBox: {
    flex: 1,
    justifyContent: "center",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 23,
    color: GREEN,
    lineHeight: 29,
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    marginTop: 1,
  },

  searchWrapper: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    paddingBottom: 10,
  },

  searchBox: {
    height: 48,
    borderRadius: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: TEXT,
    marginLeft: 9,
    paddingVertical: 0,
  },

  summaryRow: {
    paddingHorizontal: H_PADDING,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: GREEN,
  },

  userCount: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: MUTED,
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
    marginTop: 10,
  },

  listContent: {
    paddingHorizontal: H_PADDING,
    paddingBottom: Platform.OS === "ios" ? 32 : 24,
  },

  userCard: {
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  userTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatarBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#D9EFD1",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 12,
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  userMainInfo: {
    flex: 1,
    paddingRight: 8,
  },

  userName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: TEXT,
  },

  userEmail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    marginTop: 1,
  },

  roleBadge: {
    minWidth: 72,
    height: 27,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  roleBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
  },

  userDetailsBox: {
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: "#EDF1EC",
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    gap: 5,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  detailText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11.5,
    color: "#444444",
    marginLeft: 8,
  },

  deleteButton: {
    height: 42,
    borderRadius: 21,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },

  deleteButtonDisabled: {
    backgroundColor: "#F1F1F1",
    borderWidth: 1,
    borderColor: BORDER,
  },

  deleteButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: WHITE,
  },

  deleteButtonTextDisabled: {
    color: MUTED,
  },

  emptyBox: {
    minHeight: 250,
    borderRadius: 18,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 20,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: TEXT,
    marginTop: 10,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },
});
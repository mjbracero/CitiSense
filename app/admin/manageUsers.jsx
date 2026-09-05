import {
  Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import KeyboardAwareScrollView, {
  KEYBOARD_SCROLL_PROPS,
} from "../../components/KeyboardAwareScrollView";
import { PageSkeleton, UserListSkeleton } from "../../components/skeletons";
import ComplaintsLoadMoreFooter from "../../components/ComplaintsLoadMoreFooter";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { computeOffsetHasMore, waitOffsetPageDelay } from "../../lib/complaintPagination";
import {
  buildUserPageQuery,
  getUserPageSize,
  mergeUserPages,
} from "../../lib/userPagination";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { writeAuditLog } from "../../lib/auditLogService";
import { DEPARTMENT_OFFICES } from "../../lib/complaintCategories";

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
const ADMIN_USERS_CACHE_KEY = "admin.manageUsers";

const ROLE_OPTIONS = [
  { id: "citizen", label: "Citizen" },
  { id: "moderator", label: "Department Head" },
  { id: "admin", label: "Admin" },
];

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

  if (cleanRole === "moderator" || cleanRole === "departmenthead") {
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

function storedRoleFrom(role) {
  const cleanRole = normalizeText(role);

  if (cleanRole === "admin") return "admin";
  if (cleanRole === "moderator" || cleanRole === "departmenthead") {
    return "moderator";
  }

  return "citizen";
}

function roleLabelFrom(role) {
  return getRoleColor(role).label;
}

function isUserBanned(user) {
  return Boolean(user?.banned_at);
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

  const cachedUsers = getPageCache(ADMIN_USERS_CACHE_KEY);
  const [users, setUsers] = useState(cachedUsers?.users ?? []);
  const [usersTotal, setUsersTotal] = useState(
    cachedUsers?.total ?? cachedUsers?.users?.length ?? 0
  );
  const [currentAdminId, setCurrentAdminId] = useState(
    cachedUsers?.currentAdminId ?? null
  );
  const [loadingUsers, setLoadingUsers] = useState(!cachedUsers);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [hasMoreUsers, setHasMoreUsers] = useState(
    cachedUsers?.hasMore !== false
  );
  const [refreshing, setRefreshing] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [banningUserId, setBanningUserId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState("citizen");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const usersRef = useRef(cachedUsers?.users ?? []);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(cachedUsers?.hasMore !== false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const handleBack = () => {
    router.replace("/admin/dashboard");
  };

  const loadUsers = useCallback(async (showLoader = true, append = false) => {
    const cached = !append ? getPageCache(ADMIN_USERS_CACHE_KEY) : null;

    if (!append && cached?.users) {
      usersRef.current = cached.users;
      setUsers(cached.users);
      setUsersTotal(cached.total ?? cached.users.length);
      hasMoreRef.current = cached.hasMore !== false;
      setHasMoreUsers(cached.hasMore !== false);
    }

    if (append) {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMoreUsers(true);
    } else {
      hasMoreRef.current = cached?.hasMore !== false;
    }

    try {
      if (showLoader && !append && shouldShowPageLoader(ADMIN_USERS_CACHE_KEY)) {
        setLoadingUsers(true);
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        if (shouldShowPageLoader(ADMIN_USERS_CACHE_KEY)) {
          setCurrentAdminId(null);
          if (!append) {
            setUsers([]);
            setUsersTotal(0);
          }
        }
        return;
      }

      setCurrentAdminId(user.id);

      const offset = append ? usersRef.current.length : 0;
      const pageSize = getUserPageSize(append, cached?.users?.length || 0);

      await waitOffsetPageDelay(offset);

      const { data, error, count } = await buildUserPageQuery(supabase, {
        offset,
        pageSize,
      });

      if (error) {
        notify("Load Failed", error.message);
        if (!append && !cached) {
          setUsers([]);
          setUsersTotal(0);
        }
        return;
      }

      const total = count ?? 0;
      setUsersTotal(total);

      const nextUsers = append
        ? mergeUserPages(usersRef.current, data || [])
        : data || [];

      usersRef.current = nextUsers;
      setUsers(nextUsers);

      const more = computeOffsetHasMore({
        loadedCount: nextUsers.length,
        lastPageLength: (data || []).length,
        total,
        pageSize,
      });
      hasMoreRef.current = more;
      setHasMoreUsers(more);

      setPageCache(ADMIN_USERS_CACHE_KEY, {
        users: nextUsers,
        currentAdminId: user.id,
        total,
        hasMore: more,
      });
    } catch (error) {
      console.log("Load users error:", error);
      if (shouldShowPageLoader(ADMIN_USERS_CACHE_KEY) && !append) {
        notify("Load Failed", "Unable to load users.");
        setUsers([]);
        setUsersTotal(0);
      }
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
      loadingMoreRef.current = false;
      setLoadingMoreUsers(false);
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
      const role = roleLabelFrom(item.role).toLowerCase();
      const department = normalizeText(item.department);
      const contact = normalizeText(item.contact_number);
      const banned = isUserBanned(item) ? "banned" : "";

      return (
        name.includes(keyword) ||
        email.includes(keyword) ||
        role.includes(keyword) ||
        department.includes(keyword) ||
        contact.includes(keyword) ||
        banned.includes(keyword)
      );
    });
  }, [users, searchText]);

  const applyUserUpdate = (updatedUser) => {
    if (!updatedUser?.id) return;

    setUsers((prev) => {
      const next = prev.map((item) =>
        item.id === updatedUser.id ? { ...item, ...updatedUser } : item
      );
      usersRef.current = next;
      return next;
    });
  };

  const closeRoleModal = () => {
    if (savingRole) return;

    setRoleModalUser(null);
    setSelectedRole("citizen");
    setSelectedDepartment("");
  };

  const openRoleModal = (targetUser) => {
    if (!targetUser?.id) return;

    if (targetUser.id === currentAdminId) {
      notify("Not Allowed", "You cannot change your own role.");
      return;
    }

    setRoleModalUser(targetUser);
    setSelectedRole(storedRoleFrom(targetUser.role));
    setSelectedDepartment(targetUser.department || "");
  };

  const saveUserRole = async () => {
    if (!roleModalUser?.id) return;

    if (selectedRole === "moderator" && !selectedDepartment.trim()) {
      notify(
        "Department Required",
        "Please assign an office before saving a department head role."
      );
      return;
    }

    const nextRole = selectedRole;

    try {
      setSavingRole(true);

      const { data, error } = await supabase.rpc("admin_set_user_role", {
        p_user_id: roleModalUser.id,
        p_role: nextRole,
        p_department: nextRole === "moderator" ? selectedDepartment.trim() : null,
      });

      if (error) {
        notify("Role Update Failed", error.message);
        return;
      }

      const updated = Array.isArray(data) ? data[0] : data;
      applyUserUpdate(updated);

      writeAuditLog({
        action: "user_role_change",
        title: "User Role Updated",
        description: `${
          roleModalUser.full_name || roleModalUser.email || "A user"
        } is now a ${roleLabelFrom(nextRole)}.`,
        entityType: "user",
        entityId: roleModalUser.id,
        actorRole: "admin",
        metadata: {
          previous_role: roleModalUser.role,
          new_role: nextRole,
          department: nextRole === "moderator" ? selectedDepartment.trim() : null,
        },
      });

      notify(
        "Role Updated",
        `${roleModalUser.full_name || "This user"} is now a ${roleLabelFrom(nextRole)}.`
      );

      setRoleModalUser(null);
    } catch (error) {
      console.log("Save user role error:", error);
      notify("Role Update Failed", "Unable to update this user's role.");
    } finally {
      setSavingRole(false);
    }
  };

  const setUserBanned = async (targetUser, banned) => {
    if (!targetUser?.id) return;

    if (targetUser.id === currentAdminId) {
      notify("Not Allowed", "You cannot ban your own admin account.");
      return;
    }

    try {
      setBanningUserId(targetUser.id);

      const { data, error } = await supabase.rpc("admin_set_user_banned", {
        p_user_id: targetUser.id,
        p_banned: banned,
      });

      if (error) {
        notify(banned ? "Ban Failed" : "Unban Failed", error.message);
        return;
      }

      const updated = Array.isArray(data) ? data[0] : data;
      applyUserUpdate(updated);

      writeAuditLog({
        action: banned ? "user_ban" : "user_unban",
        title: banned ? "User Banned" : "User Unbanned",
        description: `${
          targetUser.full_name || targetUser.email || "A user"
        } was ${banned ? "banned from CitiSense" : "allowed to sign in again"}.`,
        entityType: "user",
        entityId: targetUser.id,
        actorRole: "admin",
        metadata: {
          banned,
          target_email: targetUser.email,
          target_role: targetUser.role,
        },
      });

      notify(
        banned ? "User Banned" : "User Unbanned",
        banned
          ? "This account can no longer log in."
          : "This account can log in again."
      );
    } catch (error) {
      console.log("Ban user error:", error);
      notify(
        banned ? "Ban Failed" : "Unban Failed",
        "Unable to update this user's ban status."
      );
    } finally {
      setBanningUserId(null);
    }
  };

  const confirmBanUser = (targetUser) => {
    const banned = isUserBanned(targetUser);

    notify(
      banned ? "Unban User" : "Ban User",
      banned
        ? `Allow ${targetUser.full_name || targetUser.email || "this user"} to log in again?`
        : `Ban ${
            targetUser.full_name || targetUser.email || "this user"
          }? They will not be able to log in until you unban them.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: banned ? "Unban" : "Ban User",
          style: banned ? "default" : "destructive",
          onPress: () => setUserBanned(targetUser, !banned),
        },
      ]
    );
  };

  const deleteUserAccount = async (targetUser) => {
    if (!targetUser?.id) return;

    if (targetUser.id === currentAdminId) {
      notify("Not Allowed", "You cannot delete your own admin account.");
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
        notify("Delete Failed", error.message);
        return;
      }

      if (data?.error) {
        notify("Delete Failed", data.error);
        return;
      }

      setUsers((prev) => {
        const next = prev.filter((item) => item.id !== targetUser.id);
        usersRef.current = next;
        return next;
      });
      setUsersTotal((total) => Math.max(0, total - 1));

      writeAuditLog({
        action: "user_delete",
        title: "User Account Deleted",
        description: `${
          targetUser.full_name || targetUser.email || "A user"
        } was removed from CitiSense.`,
        entityType: "user",
        entityId: targetUser.id,
        actorRole: "admin",
        metadata: {
          deleted_email: targetUser.email,
          deleted_role: targetUser.role,
        },
      });

      notify("Deleted", "User account has been deleted.");
    } catch (error) {
      console.log("Delete user error:", error);
      notify("Delete Failed", "Unable to delete user account.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const confirmDeleteUser = (targetUser) => {
    notify(
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
    const isBanning = banningUserId === item.id;
    const isCurrentAdmin = item.id === currentAdminId;
    const banned = isUserBanned(item);
    const actionsDisabled = isDeleting || isBanning || isCurrentAdmin;

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

          <View style={styles.badgeColumn}>
            {banned ? (
              <View style={styles.bannedBadge}>
                <Text style={styles.bannedBadgeText}>Banned</Text>
              </View>
            ) : null}
            <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
              <Text style={[styles.roleBadgeText, { color: roleStyle.color }]}>
                {roleStyle.label}
              </Text>
            </View>
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

        <View style={styles.actionRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={actionsDisabled}
            style={[
              styles.roleButton,
              actionsDisabled && styles.actionButtonDisabled,
            ]}
            onPress={() => openRoleModal(item)}
          >
            <Feather
              name="edit-3"
              size={16}
              color={isCurrentAdmin ? MUTED : GREEN}
            />
            <Text
              style={[
                styles.roleButtonText,
                isCurrentAdmin && styles.actionButtonTextDisabled,
              ]}
            >
              Edit Role
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            disabled={actionsDisabled}
            style={[
              banned ? styles.unbanButton : styles.banButton,
              actionsDisabled && styles.actionButtonDisabled,
            ]}
            onPress={() => confirmBanUser(item)}
          >
            {isBanning ? (
              <ActivityIndicator size="small" color={banned ? GREEN : RED} />
            ) : (
              <>
                <Feather
                  name={banned ? "check-circle" : "slash"}
                  size={16}
                  color={isCurrentAdmin ? MUTED : banned ? GREEN : RED}
                />
                <Text
                  style={[
                    banned ? styles.unbanButtonText : styles.banButtonText,
                    isCurrentAdmin && styles.actionButtonTextDisabled,
                  ]}
                >
                  {banned ? "Unban" : "Ban User"}
                </Text>
              </>
            )}
          </TouchableOpacity>
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
    return <PageSkeleton variant="users" />;
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
              Change roles, ban accounts, or delete users.
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
              returnKeyType="search"
              blurOnSubmit
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
          <Text style={styles.userCount}>
            {searchText.trim()
              ? `${filteredUsers.length} shown`
              : `${users.length} of ${usersTotal || users.length}`}
          </Text>
        </View>

        {loadingUsers ? (
          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            <UserListSkeleton count={4} />
          </KeyboardAwareScrollView>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            extraData={`${deletingUserId || ""}:${banningUserId || ""}:${currentAdminId || ""}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            {...KEYBOARD_SCROLL_PROPS}
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
            onEndReached={() => {
              if (searchText.trim() || !hasMoreUsers) return;
              loadUsers(false, true);
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              !searchText.trim() ? (
                <ComplaintsLoadMoreFooter
                  loading={loadingMoreUsers}
                  label="Loading more users..."
                />
              ) : null
            }
          />
        )}
      </View>

      <Modal
        visible={Boolean(roleModalUser)}
        animationType="slide"
        transparent
        onRequestClose={closeRoleModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Edit Role</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {roleModalUser?.full_name || roleModalUser?.email || "User"}
            </Text>

            <Text style={styles.modalSectionLabel}>Account role</Text>
            <View style={styles.roleOptionList}>
              {ROLE_OPTIONS.map((option) => {
                const selected = selectedRole === option.id;

                return (
                  <TouchableOpacity
                    key={option.id}
                    activeOpacity={0.75}
                    style={[
                      styles.roleOption,
                      selected && styles.roleOptionSelected,
                    ]}
                    onPress={() => setSelectedRole(option.id)}
                  >
                    <Text
                      style={[
                        styles.roleOptionText,
                        selected && styles.roleOptionTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {selected ? (
                      <Feather name="check" size={16} color={GREEN} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedRole === "moderator" ? (
              <>
                <Text style={styles.modalSectionLabel}>Assigned office</Text>
                <ScrollView
                  style={styles.departmentList}
                  showsVerticalScrollIndicator={false}
                >
                  {DEPARTMENT_OFFICES.map((office) => {
                    const selected = selectedDepartment === office;

                    return (
                      <TouchableOpacity
                        key={office}
                        activeOpacity={0.75}
                        style={[
                          styles.departmentOption,
                          selected && styles.departmentOptionSelected,
                        ]}
                        onPress={() => setSelectedDepartment(office)}
                      >
                        <Text
                          style={[
                            styles.departmentOptionText,
                            selected && styles.departmentOptionTextSelected,
                          ]}
                        >
                          {office}
                        </Text>
                        {selected ? (
                          <Feather name="check" size={16} color={GREEN} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={savingRole}
                style={styles.modalCancelButton}
                onPress={closeRoleModal}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                disabled={savingRole}
                style={styles.modalSaveButton}
                onPress={saveUserRole}
              >
                {savingRole ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={styles.modalSaveText}>Save Role</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  badgeColumn: {
    alignItems: "flex-end",
    gap: 6,
  },

  bannedBadge: {
    minWidth: 72,
    height: 22,
    borderRadius: 11,
    backgroundColor: SOFT_RED,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  bannedBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: RED,
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
    marginTop: 8,
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

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  roleButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
  },

  roleButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
  },

  banButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: SOFT_RED,
    borderWidth: 1,
    borderColor: "#F3C7C7",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
  },

  banButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: RED,
  },

  unbanButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#D9EFD1",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
  },

  unbanButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
  },

  actionButtonDisabled: {
    backgroundColor: "#F1F1F1",
    borderColor: BORDER,
  },

  actionButtonTextDisabled: {
    color: MUTED,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  modalSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
  },

  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: BORDER,
    alignSelf: "center",
    marginBottom: 12,
  },

  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: TEXT,
  },

  modalSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    marginBottom: 14,
  },

  modalSectionLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: TEXT,
    marginBottom: 8,
  },

  roleOptionList: {
    gap: 8,
    marginBottom: 16,
  },

  roleOption: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  roleOptionSelected: {
    backgroundColor: LIGHT_GREEN,
    borderColor: GREEN,
  },

  roleOptionText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: TEXT,
  },

  roleOptionTextSelected: {
    fontFamily: "Poppins_700Bold",
    color: GREEN,
  },

  departmentList: {
    maxHeight: 220,
    marginBottom: 16,
  },

  departmentOption: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  departmentOptionSelected: {
    backgroundColor: LIGHT_GREEN,
    borderColor: GREEN,
  },

  departmentOptionText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: TEXT,
    paddingRight: 8,
  },

  departmentOptionTextSelected: {
    fontFamily: "Poppins_600SemiBold",
    color: GREEN,
  },

  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },

  modalCancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F1F4F1",
    alignItems: "center",
    justifyContent: "center",
  },

  modalCancelText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: TEXT,
  },

  modalSaveButton: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  modalSaveText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: WHITE,
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
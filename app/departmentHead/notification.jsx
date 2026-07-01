import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const BLUE = "#315A9A";
const ORANGE = "#F4A24C";
const YELLOW = "#A97700";

const H_PADDING = 20;

const filterOptions = [
  "All",
  "Unread",
  "New Assignment",
  "Reassigned",
  "Completed",
  "Returned",
];

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/departmentHead/dashboard",
    activePath: "departmentHead/dashboard",
    flex: 0.82,
  },
  {
    label: "Assigned Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/departmentHead/assignedComplaints",
    activePath: "departmentHead/assignedComplaints",
    flex: 1.55,
  },
  {
    label: "Notifications",
    activeIcon: "notifications",
    inactiveIcon: "notifications-outline",
    route: "/departmentHead/notification",
    activePath: "departmentHead/notification",
    flex: 1.15,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/departmentHead/profile",
    activePath: "departmentHead/profile",
    flex: 0.82,
  },
];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeMetadata(metadata) {
  if (!metadata) return {};

  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof metadata === "object" ? metadata : {};
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Just now";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDisplayType(type, status) {
  const cleanType = normalizeText(type);
  const cleanStatus = normalizeText(status);

  if (
    cleanType === "new_assignment" ||
    cleanType === "assigned" ||
    cleanType === "new complaint assigned"
  ) {
    return "New Assignment";
  }

  if (
    cleanType === "reassigned_to_department" ||
    cleanType === "reassigned" ||
    cleanType === "reassignment"
  ) {
    return "Reassigned";
  }

  if (
    cleanType === "completed_by_admin" ||
    cleanType === "completed" ||
    cleanStatus === "completed"
  ) {
    return "Completed";
  }

  if (
    cleanType === "returned_by_admin" ||
    cleanType === "citizen_returned" ||
    cleanType === "returned" ||
    cleanStatus.includes("returned") ||
    cleanStatus.includes("unsolved") ||
    cleanStatus.includes("unresolved")
  ) {
    return "Returned";
  }

  if (cleanStatus === "for validation" || cleanType === "validation") {
    return "Validation";
  }

  return "Update";
}

function getNotificationStyle(type, status) {
  const displayType = getDisplayType(type, status);

  if (displayType === "New Assignment") {
    return {
      bg: "#E8EEFF",
      color: BLUE,
      icon: "clipboard-text-outline",
    };
  }

  if (displayType === "Reassigned") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      icon: "swap-horizontal-circle-outline",
    };
  }

  if (displayType === "Completed") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      icon: "check-circle-outline",
    };
  }

  if (displayType === "Returned") {
    return {
      bg: "#FFF2E8",
      color: ORANGE,
      icon: "alert-circle-outline",
    };
  }

  if (displayType === "Validation") {
    return {
      bg: "#FFF2C2",
      color: YELLOW,
      icon: "clipboard-check-outline",
    };
  }

  return {
    bg: "#F1F4F1",
    color: MUTED,
    icon: "bell-outline",
  };
}

function mapNotification(row) {
  const metadata = normalizeMetadata(row.metadata);
  const displayType = getDisplayType(row.type, row.status);
  const typeStyle = getNotificationStyle(row.type, row.status);
  const shortId = metadata.short_id || metadata.complaint_label || "";

  return {
    id: row.id,
    moderatorId: row.moderator_id,
    complaintId: row.complaint_id,
    type: displayType,
    rawType: row.type || "update",
    title: row.title || "Complaint Update",
    message:
      row.message || "A complaint assigned to your department has an update.",
    complaintIdLabel: shortId || (row.complaint_id ? String(row.complaint_id).slice(0, 8) : "N/A"),
    complaintTitle:
      metadata.complaint_title || metadata.title || "Assigned Complaint",
    category: row.category || metadata.category || metadata.new_category || "N/A",
    department:
      row.department ||
      metadata.assigned_office ||
      metadata.new_assigned_office ||
      "N/A",
    location:
      row.location_text || metadata.location_text || "Pinned location not available",
    status: row.status || metadata.new_status || "Update",
    date: formatDate(row.created_at),
    time: formatTime(row.created_at),
    unread: row.is_read === false,
    createdAt: row.created_at,
    metadata,
    typeStyle,
  };
}

export default function DepartmentHeadNotification() {
  const router = useRouter();
  const pathname = usePathname();

  const {
    unreadNotificationCount,
    reloadUnreadNotificationCount,
    resetUnreadNotificationCount,
  } = useDepartmentHeadUnreadNotifications();

  const [notifications, setNotifications] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [currentDepartmentHeadId, setCurrentDepartmentHeadId] = useState(null);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const smoothNavigate = useCallback(
    (route, isActive = false) => {
      if (isActive || navigationLockRef.current) return;

      navigationLockRef.current = true;

      requestAnimationFrame(() => {
        router.replace(route);
      });

      if (navigationUnlockTimerRef.current) {
        clearTimeout(navigationUnlockTimerRef.current);
      }

      navigationUnlockTimerRef.current = setTimeout(() => {
        navigationLockRef.current = false;
      }, 450);
    },
    [router]
  );

  useEffect(() => {
    return () => {
      if (navigationUnlockTimerRef.current) {
        clearTimeout(navigationUnlockTimerRef.current);
      }
    };
  }, []);

  const loadNotifications = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoadingNotifications(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setCurrentDepartmentHeadId(null);
        setNotifications([]);
        return;
      }

      setCurrentDepartmentHeadId(user.id);

      const { data, error } = await supabase
        .from("moderator_notifications")
        .select("*")
        .eq("moderator_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Load department head notifications error:", error);
        setNotifications([]);
        return;
      }

      setNotifications((data || []).map(mapNotification));
    } catch (error) {
      console.log("Load moderator notifications catch error:", error);
      setNotifications([]);
    } finally {
      if (showLoader) setLoadingNotifications(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(false);
      reloadUnreadNotificationCount?.();
    }, [loadNotifications, reloadUnreadNotificationCount])
  );

  useEffect(() => {
    if (!currentDepartmentHeadId) return;

    const channel = supabase
      .channel(`moderator-notifications-ui-${currentDepartmentHeadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderator_notifications",
          filter: `moderator_id=eq.${currentDepartmentHeadId}`,
        },
        () => {
          loadNotifications(false);
          reloadUnreadNotificationCount?.();
        }
      )
      .subscribe((status) => {
        console.log("Department head notifications realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentDepartmentHeadId, loadNotifications, reloadUnreadNotificationCount]);

  const filteredNotifications = useMemo(() => {
    if (selectedFilter === "Unread") {
      return notifications.filter((item) => item.unread);
    }

    if (selectedFilter !== "All") {
      return notifications.filter((item) => item.type === selectedFilter);
    }

    return notifications;
  }, [notifications, selectedFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    loadNotifications(false);
    reloadUnreadNotificationCount?.();
  };

  const markSingleAsRead = async (notification) => {
    if (!notification?.id || !currentDepartmentHeadId || !notification.unread) return;

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              unread: false,
            }
          : item
      )
    );

    const { error } = await supabase
      .from("moderator_notifications")
      .update({ is_read: true })
      .eq("id", notification.id)
      .eq("moderator_id", currentDepartmentHeadId);

    if (error) {
      console.log("Mark department head notification read error:", error);
      loadNotifications(false);
      return;
    }

    await reloadUnreadNotificationCount?.();
  };

  const markAllAsRead = async () => {
    if (!currentDepartmentHeadId || unreadNotificationCount <= 0) return;

    try {
      setMarkingAllRead(true);

      setNotifications((prev) =>
        prev.map((item) => ({
          ...item,
          unread: false,
        }))
      );

      resetUnreadNotificationCount?.();

      const { error } = await supabase
        .from("moderator_notifications")
        .update({ is_read: true })
        .eq("moderator_id", currentDepartmentHeadId)
        .eq("is_read", false);

      if (error) {
        Alert.alert("Update Failed", error.message);
        loadNotifications(false);
        reloadUnreadNotificationCount?.();
        return;
      }

      await reloadUnreadNotificationCount?.();
      await loadNotifications(false);
    } catch (error) {
      console.log("Mark all moderator notifications read error:", error);
      Alert.alert("Update Failed", "Unable to mark notifications as read.");
      loadNotifications(false);
      reloadUnreadNotificationCount?.();
    } finally {
      setMarkingAllRead(false);
    }
  };

  const openNotificationDetails = async (notification) => {
    const updatedNotification = { ...notification, unread: false };

    setSelectedNotification(updatedNotification);
    setDetailsVisible(true);

    await markSingleAsRead(notification);
  };

  const closeNotificationDetails = () => {
    setDetailsVisible(false);
    setSelectedNotification(null);
  };

  const openRelatedComplaint = async (notification = selectedNotification) => {
    if (!notification?.complaintId) {
      closeNotificationDetails();
      router.replace("/departmentHead/assignedComplaints");
      return;
    }

    closeNotificationDetails();

    router.push({
      pathname: "/departmentHead/assignedComplaints",
      params: {
        complaintId: notification.complaintId,
        openDetails: "true",
      },
    });
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
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.mainContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={GREEN}
              colors={[GREEN]}
            />
          }
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerTopRow}>
            <Text style={styles.headerTitle}>Notifications</Text>

            {unreadNotificationCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.75}
                disabled={markingAllRead}
                style={styles.markAllButton}
                onPress={markAllAsRead}
              >
                {markingAllRead ? (
                  <ActivityIndicator size="small" color={GREEN} />
                ) : (
                  <Text style={styles.markAllButtonText}>Mark all read</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScrollContent}
          >
            {filterOptions.map((item) => {
              const isActive = selectedFilter === item;

              return (
                <TouchableOpacity
                  key={item}
                  activeOpacity={0.75}
                  style={[
                    styles.filterChip,
                    isActive && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedFilter(item)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      isActive && styles.filterChipTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.notificationList}>
            {loadingNotifications ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={styles.emptyTitle}>Loading notifications...</Text>
              </View>
            ) : filteredNotifications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="notifications-off-outline"
                  size={34}
                  color={MUTED}
                />
                <Text style={styles.emptyTitle}>No notifications found</Text>
                <Text style={styles.emptyText}>
                  Department notifications will appear here in real time.
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => {
                const typeStyle = item.typeStyle;

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.78}
                    style={[
                      styles.notificationCard,
                      item.unread && styles.notificationCardUnread,
                    ]}
                    onPress={() => openNotificationDetails(item)}
                  >
                    <View
                      style={[
                        styles.notificationIconCircle,
                        { backgroundColor: typeStyle.bg },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={typeStyle.icon}
                        size={24}
                        color={typeStyle.color}
                      />
                    </View>

                    <View style={styles.notificationContent}>
                      <View style={styles.notificationTopRow}>
                        <Text style={styles.notificationTitle} numberOfLines={1}>
                          {item.title}
                        </Text>

                        {item.unread && <View style={styles.unreadDot} />}
                      </View>

                      <Text style={styles.notificationMessage} numberOfLines={2}>
                        {item.message}
                      </Text>

                      <Text style={styles.complaintTitleText} numberOfLines={1}>
                        {item.complaintTitle}
                      </Text>

                      <View style={styles.notificationBottomRow}>
                        <View
                          style={[
                            styles.typeBadge,
                            { backgroundColor: typeStyle.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeBadgeText,
                              { color: typeStyle.color },
                            ]}
                            numberOfLines={1}
                          >
                            {item.type}
                          </Text>
                        </View>

                        <Text style={styles.dateTimeText} numberOfLines={1}>
                          {item.date} • {item.time}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          {bottomTabs.map((tab) => {
            const isActive =
              pathname?.includes(tab.activePath) ||
              (tab.label === "Home" &&
                (pathname === "/" || pathname?.includes("departmentHead/dashboard")));

            return (
              <TouchableOpacity
                key={tab.label}
                style={[styles.navItem, { flex: tab.flex }]}
                activeOpacity={0.7}
                onPress={() => smoothNavigate(tab.route, isActive)}
              >
                <View style={styles.navIconWrap}>
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={25}
                    color={isActive ? GREEN : TEXT}
                  />

                  {tab.label === "Notifications" &&
                    unreadNotificationCount > 0 && (
                      <View style={styles.notificationNavBadge}>
                        <Text style={styles.notificationNavBadgeText}>
                          {unreadNotificationCount > 99
                            ? "99+"
                            : unreadNotificationCount}
                        </Text>
                      </View>
                    )}
                </View>

                <Text
                  style={[
                    styles.navLabel,
                    {
                      color: isActive ? GREEN : TEXT,
                      fontFamily: isActive
                        ? "Poppins_600SemiBold"
                        : "Poppins_500Medium",
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Modal
          visible={detailsVisible}
          transparent
          animationType="slide"
          onRequestClose={closeNotificationDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Notification Details</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={closeNotificationDetails}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              {selectedNotification && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.detailsTypeRow}>
                    <View
                      style={[
                        styles.detailsIconCircle,
                        { backgroundColor: selectedNotification.typeStyle.bg },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={selectedNotification.typeStyle.icon}
                        size={28}
                        color={selectedNotification.typeStyle.color}
                      />
                    </View>

                    <View style={styles.detailsTitleBox}>
                      <Text style={styles.detailsTitle}>
                        {selectedNotification.title}
                      </Text>
                      <Text style={styles.detailsSubtitle}>
                        {selectedNotification.date} • {selectedNotification.time}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.messageBox}>
                    <Text style={styles.infoLabel}>Message</Text>
                    <Text style={styles.messageText}>
                      {selectedNotification.message}
                    </Text>
                  </View>

                  <View style={styles.complaintInfoCard}>
                    <Text style={styles.sectionTitle}>Complaint Information</Text>

                    <InfoRow
                      label="Notification Type"
                      value={selectedNotification.type}
                    />
                    <InfoRow
                      label="Complaint ID"
                      value={selectedNotification.complaintIdLabel}
                    />
                    <InfoRow
                      label="Complaint Title"
                      value={selectedNotification.complaintTitle}
                    />
                    <InfoRow
                      label="Category"
                      value={selectedNotification.category}
                    />
                    <InfoRow
                      label="Department"
                      value={selectedNotification.department}
                    />
                    <InfoRow label="Status" value={selectedNotification.status} />
                    <InfoRow
                      label="Pinned Location"
                      value={selectedNotification.location}
                      last
                    />
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.viewComplaintButton}
                    onPress={() => openRelatedComplaint(selectedNotification)}
                  >
                    <Text style={styles.viewComplaintButtonText}>
                      View Assigned Complaint
                    </Text>
                    <Feather name="arrow-right" size={17} color={WHITE} />
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "N/A"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  mainContainer: {
    flex: 1,
    backgroundColor: BG,
  },

  loader: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    paddingBottom: 116,
  },

  headerTopRow: {
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  markAllButton: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  markAllButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  filterScrollContent: {
    gap: 8,
    paddingRight: 10,
    marginBottom: 13,
  },

  filterChip: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  filterChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: TEXT,
  },

  filterChipTextActive: {
    color: WHITE,
  },

  notificationList: {
    gap: 10,
  },

  notificationCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  notificationCardUnread: {
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
  },

  notificationIconCircle: {
    width: 47,
    height: 47,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  notificationContent: {
    flex: 1,
  },

  notificationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  notificationTitle: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 13.2,
    color: TEXT,
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: RED,
  },

  notificationMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.8,
    color: MUTED,
    lineHeight: 15,
    marginTop: 2,
  },

  complaintTitleText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.2,
    color: GREEN,
    marginTop: 4,
  },

  notificationBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 7,
  },

  typeBadge: {
    minHeight: 23,
    borderRadius: 12,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  typeBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.2,
  },

  dateTimeText: {
    flex: 1,
    textAlign: "right",
    fontFamily: "Poppins_500Medium",
    fontSize: 9.6,
    color: MUTED,
  },

  emptyCard: {
    minHeight: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: TEXT,
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 3,
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 6,
    paddingBottom: Platform.OS === "ios" ? 38 : 32,
  },

  navItem: {
    height: 58,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },

  navIconWrap: {
    position: "relative",
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  notificationNavBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: WHITE,
    includeFontPadding: false,
    lineHeight: 11,
  },

  navLabel: {
    fontSize: 8.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },

  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D7D7D7",
    alignSelf: "center",
    marginBottom: 14,
  },

  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: GREEN,
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  detailsTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 13,
  },

  detailsIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  detailsTitleBox: {
    flex: 1,
  },

  detailsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: TEXT,
    lineHeight: 22,
  },

  detailsSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    marginTop: 3,
  },

  messageBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },

  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 3,
  },

  complaintInfoCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 14,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: GREEN,
    marginBottom: 8,
  },

  infoRow: {
    marginBottom: 9,
  },

  infoRowLast: {
    marginBottom: 0,
  },

  infoLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 16,
    marginTop: 1,
  },

  viewComplaintButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },

  viewComplaintButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: WHITE,
  },
});

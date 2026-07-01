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
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const BLUE = "#315A9A";
const YELLOW = "#A97700";

const H_PADDING = 20;

const filterOptions = [
  "All",
  "Unread",
  "New Complaint",
  "Citizen Validation",
  "Reassignment",
  "Final Confirmation",
  "Returned",
];

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/admin/dashboard",
    activePath: "adminDashboard",
    flex: 0.82,
  },
  {
    label: "Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/admin/complaints",
    activePath: "adminComplaints",
    flex: 1.1,
  },
  {
    label: "Analytics",
    activeIcon: "analytics",
    inactiveIcon: "analytics-outline",
    route: "/admin/analytics",
    activePath: "adminAnalytics",
    flex: 1,
  },
  {
    label: "Notifications",
    activeIcon: "notifications",
    inactiveIcon: "notifications-outline",
    route: "/admin/notification",
    activePath: "adminNotification",
    flex: 1.15,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/admin/profile",
    activePath: "adminProfile",
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

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getDisplayType(type) {
  const cleanType = normalizeText(type);

  if (cleanType === "new_complaint" || cleanType === "new complaint") {
    return "New Complaint";
  }

  if (
    cleanType === "citizen_validation" ||
    cleanType === "citizen validation" ||
    cleanType === "for_validation" ||
    cleanType === "for validation"
  ) {
    return "Citizen Validation";
  }

  if (
    cleanType === "reassigned" ||
    cleanType === "reassignment" ||
    cleanType === "reassigned_to_department"
  ) {
    return "Reassignment";
  }

  if (
    cleanType === "completed" ||
    cleanType === "final_confirmation" ||
    cleanType === "final confirmation"
  ) {
    return "Final Confirmation";
  }

  if (
    cleanType === "returned" ||
    cleanType === "returned_by_admin" ||
    cleanType === "citizen_returned"
  ) {
    return "Returned";
  }

  return "System Update";
}

function getNotificationStyle(type) {
  const displayType = getDisplayType(type);

  if (displayType === "New Complaint") {
    return {
      bg: "#E8EEFF",
      color: BLUE,
      icon: "clipboard-text-outline",
    };
  }

  if (displayType === "Citizen Validation") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      icon: "account-check-outline",
    };
  }

  if (displayType === "Reassignment") {
    return {
      bg: "#E8EEFF",
      color: BLUE,
      icon: "swap-horizontal-circle-outline",
    };
  }

  if (displayType === "Final Confirmation") {
    return {
      bg: "#FFF2C2",
      color: YELLOW,
      icon: "check-decagram-outline",
    };
  }

  if (displayType === "Returned") {
    return {
      bg: "#FFF0F0",
      color: RED,
      icon: "arrow-u-left-top",
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
  const displayType = getDisplayType(row.type);

  return {
    id: row.id,
    rawId: row.id,
    type: displayType,
    title: row.title || "Admin Notification",
    message: row.message || "There is a new admin update.",
    complaintId:
      metadata.short_id ||
      metadata.complaint_id ||
      row.complaint_id ||
      "N/A",
    rawComplaintId: row.complaint_id,
    complaintTitle:
      metadata.complaint_title ||
      metadata.title ||
      "Complaint information",
    category: row.category || metadata.category || "Unclassified",
    department:
      row.department ||
      metadata.assigned_office ||
      metadata.new_assigned_office ||
      "Unassigned",
    citizen: metadata.citizen_name || metadata.full_name || "Citizen",
    location:
      row.location_text ||
      metadata.location_text ||
      metadata.location ||
      "Location not available",
    status: row.status || metadata.new_status || "Update",
    date: formatDate(row.created_at),
    time: formatTime(row.created_at),
    unread: row.is_read === false,
    createdAt: row.created_at,
    metadata,
  };
}

export default function AdminNotification() {
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState(null);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const { unreadNotificationCount, reloadUnreadNotificationCount } =
    useAdminUnreadNotifications();

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
      if (showLoader) {
        setLoadingNotifications(true);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setCurrentAdminId(null);
        setNotifications([]);
        return;
      }

      setCurrentAdminId(user.id);

      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .eq("admin_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Load admin notifications error:", error);
        Alert.alert("Load Failed", error.message);
        setNotifications([]);
        return;
      }

      setNotifications((data || []).map(mapNotification));
    } catch (error) {
      console.log("Load admin notifications catch error:", error);
      Alert.alert("Load Failed", "Unable to load admin notifications.");
      setNotifications([]);
    } finally {
      if (showLoader) {
        setLoadingNotifications(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(false);
      reloadUnreadNotificationCount();
    }, [loadNotifications, reloadUnreadNotificationCount])
  );

  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  useEffect(() => {
    if (!currentAdminId) return;

    const channel = supabase
      .channel(`admin-notifications-list-${currentAdminId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_notifications",
          filter: `admin_id=eq.${currentAdminId}`,
        },
        () => {
          loadNotifications(false);
          reloadUnreadNotificationCount();
        }
      )
      .subscribe((status) => {
        console.log("Admin notifications realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAdminId, loadNotifications, reloadUnreadNotificationCount]);

  const filteredNotifications = useMemo(() => {
    if (selectedFilter === "Unread") {
      return notifications.filter((item) => item.unread);
    }

    if (selectedFilter === "All") {
      return notifications;
    }

    return notifications.filter((item) => item.type === selectedFilter);
  }, [notifications, selectedFilter]);

  const markNotificationAsRead = async (notification) => {
    if (!notification?.rawId || !currentAdminId || !notification.unread) return;

    setNotifications((prev) =>
      prev.map((item) =>
        item.rawId === notification.rawId ? { ...item, unread: false } : item
      )
    );

    const { error } = await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("id", notification.rawId)
      .eq("admin_id", currentAdminId);

    if (error) {
      console.log("Mark admin notification read error:", error);
      loadNotifications(false);
      return;
    }

    reloadUnreadNotificationCount();
  };

  const markAllAsRead = async () => {
    if (!currentAdminId || unreadNotificationCount === 0) return;

    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        unread: false,
      }))
    );

    const { error } = await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .eq("admin_id", currentAdminId)
      .eq("is_read", false);

    if (error) {
      Alert.alert("Update Failed", error.message);
      loadNotifications(false);
      return;
    }

    reloadUnreadNotificationCount();
  };

  const openNotificationDetails = async (notification) => {
    const updatedNotification = { ...notification, unread: false };

    setSelectedNotification(updatedNotification);
    setDetailsVisible(true);

    await markNotificationAsRead(notification);
  };

  const closeNotificationDetails = () => {
    setDetailsVisible(false);
    setSelectedNotification(null);
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
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Notifications</Text>
              <Text
                style={{
                  fontFamily: "Poppins_500Medium",
                  fontSize: 11.5,
                  color: MUTED,
                  marginTop: 2,
                }}
              >
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} unread notification${
                      unreadNotificationCount > 1 ? "s" : ""
                    }`
                  : "You're all caught up"}
              </Text>
            </View>

            {unreadNotificationCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={markAllAsRead}
                style={{
                  minHeight: 32,
                  borderRadius: 16,
                  backgroundColor: GREEN,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Poppins_700Bold",
                    fontSize: 10.5,
                    color: WHITE,
                  }}
                >
                  Mark all read
                </Text>
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
                  Admin notifications will appear here in real time.
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => {
                const typeStyle = getNotificationStyle(item.type);

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
                (pathname === "/" || pathname?.includes("admin/dashboard")));

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
                        {
                          backgroundColor: getNotificationStyle(
                            selectedNotification.type
                          ).bg,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={getNotificationStyle(selectedNotification.type).icon}
                        size={28}
                        color={
                          getNotificationStyle(selectedNotification.type).color
                        }
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
                      value={selectedNotification.complaintId}
                    />
                    <InfoRow
                      label="Complaint Title"
                      value={selectedNotification.complaintTitle}
                    />
                    <InfoRow label="Status" value={selectedNotification.status} />
                    <InfoRow
                      label="Category"
                      value={selectedNotification.category}
                    />
                    <InfoRow
                      label="Department"
                      value={selectedNotification.department}
                    />
                    <InfoRow
                      label="Pinned Location"
                      value={selectedNotification.location}
                      last
                    />
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.viewComplaintButton}
                    onPress={() => {
                      closeNotificationDetails();
                      router.replace({
                        pathname: "/admin/complaints",
                        params: {
                          complaintId: selectedNotification.rawComplaintId,
                          openDetails: "true",
                        },
                      });
                    }}
                  >
                    <Text style={styles.viewComplaintButtonText}>
                      View Overall Complaints
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
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
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
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

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const ORANGE = "#F4A24C";
const BLUE = "#315A9A";

const H_PADDING = 20;

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/citizen/dashboard",
    activePath: "citizen/dashboard",
    flex: 0.85,
  },
  {
    label: "Submit",
    activeIcon: "add-circle",
    inactiveIcon: "add-circle-outline",
    route: "/citizen/submit",
    activePath: "citizen/submit",
    flex: 0.9,
  },
  {
    label: "My Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/citizen/complaints",
    activePath: "citizen/complaints",
    flex: 1.45,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/citizen/profile",
    activePath: "citizen/profile",
    flex: 0.85,
  },
];

function getFormattedDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

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

function formatNotificationTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Just now";

  const now = new Date();
  const yesterday = new Date();

  yesterday.setDate(now.getDate() - 1);

  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isValidationTransition(type, metadata = {}) {
  const normalizedType = normalizeText(type);
  const oldStatus = normalizeText(metadata.old_status);
  const newStatus = normalizeText(metadata.new_status);

  return (
    normalizedType === "validation" &&
    oldStatus === "in progress" &&
    newStatus === "for validation"
  );
}

function getNotificationStyle(type, status, metadata = {}) {
  const normalizedType = normalizeText(type);
  const normalizedStatus = normalizeText(status);
  const actualValidation = isValidationTransition(type, metadata);

  if (actualValidation) {
    return {
      statusBg: LIGHT_GREEN,
      statusColor: GREEN,
      icon: "clipboard-check-outline",
      iconBg: LIGHT_GREEN,
      iconColor: GREEN,
      actionLabel: "Provide Validation",
      actionType: "validation",
    };
  }

  if (normalizedType === "routed" || normalizedType === "reassigned") {
    return {
      statusBg: LIGHT_GREEN,
      statusColor: GREEN,
      icon: "send-check-outline",
      iconBg: LIGHT_GREEN,
      iconColor: GREEN,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "category") {
    return {
      statusBg: "#E8EEFF",
      statusColor: BLUE,
      icon: "shape-outline",
      iconBg: "#E8EEFF",
      iconColor: BLUE,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "priority") {
    return {
      statusBg: "#FFF2E8",
      statusColor: ORANGE,
      icon: "flag-outline",
      iconBg: "#FFF2E8",
      iconColor: ORANGE,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "duplicate" || normalizedType === "similar") {
    return {
      statusBg: "#E8EEFF",
      statusColor: BLUE,
      icon: "alert-circle-outline",
      iconBg: "#E8EEFF",
      iconColor: BLUE,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "completed" || normalizedStatus === "completed") {
    return {
      statusBg: LIGHT_GREEN,
      statusColor: GREEN,
      icon: "check-circle-outline",
      iconBg: LIGHT_GREEN,
      iconColor: GREEN,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedStatus === "for validation") {
    return {
      statusBg: LIGHT_GREEN,
      statusColor: GREEN,
      icon: "clipboard-check-outline",
      iconBg: LIGHT_GREEN,
      iconColor: GREEN,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedStatus === "in progress") {
    return {
      statusBg: "#FFF2C2",
      statusColor: "#A97700",
      icon: "progress-wrench",
      iconBg: "#FFF7DA",
      iconColor: ORANGE,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "submitted") {
    return {
      statusBg: "#E8EEFF",
      statusColor: BLUE,
      icon: "file-document-outline",
      iconBg: "#E8EEFF",
      iconColor: BLUE,
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  return {
    statusBg: "#E8EEFF",
    statusColor: BLUE,
    icon: "bell-outline",
    iconBg: "#E8EEFF",
    iconColor: BLUE,
    actionLabel: "View Details",
    actionType: "details",
  };
}

function mapNotification(row) {
  const metadata = normalizeMetadata(row.metadata);
  const style = getNotificationStyle(row.type, row.status, metadata);

  return {
    id: row.id,
    complaintId: row.complaint_id,
    type: row.type || "update",
    title: row.title || "Complaint Update",
    message: row.message || "Your complaint has a new update.",
    complaint: metadata.short_id || "",
    time: formatNotificationTime(row.created_at),
    status: row.status || row.type || "Update",
    unread: row.is_read === false,
    createdAt: row.created_at,
    metadata,
    ...style,
  };
}

export default function CitizenNotification() {
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const notificationChannelRef = useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const formattedDate = useMemo(() => getFormattedDate(new Date()), []);

  const handleBack = () => {
    router.replace("/citizen/dashboard");
  };

  const loadUnreadNotificationCount = useCallback(
    async (userId) => {
      try {
        const targetUserId = userId || currentUserId;

        if (!targetUserId) {
          setUnreadNotificationCount(0);
          return;
        }

        const { count, error } = await supabase
          .from("complaint_notifications")
          .select("*", { count: "exact", head: true })
          .eq("citizen_id", targetUserId)
          .eq("is_read", false);

        if (error) {
          console.log("Unread count error:", error);
          setUnreadNotificationCount(0);
          return;
        }

        setUnreadNotificationCount(count || 0);
      } catch (error) {
        console.log("Load unread count error:", error);
        setUnreadNotificationCount(0);
      }
    },
    [currentUserId]
  );

  const loadNotifications = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader) {
          setLoadingNotifications(true);
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setCurrentUserId(null);
          setNotifications([]);
          setUnreadNotificationCount(0);
          return;
        }

        setCurrentUserId(user.id);

        const { data, error } = await supabase
          .from("complaint_notifications")
          .select("*")
          .eq("citizen_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          Alert.alert("Load Failed", error.message);
          setNotifications([]);
          setUnreadNotificationCount(0);
          return;
        }

        const mappedNotifications = (data || []).map(mapNotification);

        setNotifications(mappedNotifications);

        const unreadCount = mappedNotifications.filter(
          (item) => item.unread
        ).length;

        setUnreadNotificationCount(unreadCount);

        await loadUnreadNotificationCount(user.id);
      } catch (error) {
        console.log("Load notifications error:", error);
        Alert.alert("Load Failed", "Unable to load notifications.");
        setNotifications([]);
        setUnreadNotificationCount(0);
      } finally {
        if (showLoader) {
          setLoadingNotifications(false);
        }
      }
    },
    [loadUnreadNotificationCount]
  );

  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(false);
    }, [loadNotifications])
  );

  useEffect(() => {
    if (!currentUserId) return;

    let cancelled = false;

    const setupNotificationChannel = async () => {
      if (notificationChannelRef.current) {
        await supabase.removeChannel(notificationChannelRef.current);
        notificationChannelRef.current = null;
      }

      const staleChannel = supabase
        .getChannels()
        .find(
          (item) =>
            item.topic === `realtime:citizen-notifications-${currentUserId}`
        );

      if (staleChannel) {
        await supabase.removeChannel(staleChannel);
      }

      if (cancelled) return;

      const channel = supabase
        .channel(`citizen-notifications-${currentUserId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "complaint_notifications",
            filter: `citizen_id=eq.${currentUserId}`,
          },
          (payload) => {
            if (payload.eventType === "INSERT") {
              const nextNotification = mapNotification(payload.new);

              setNotifications((prev) => {
                const exists = prev.some(
                  (item) => item.id === nextNotification.id
                );

                if (exists) return prev;

                return [nextNotification, ...prev];
              });
            } else if (payload.eventType === "UPDATE") {
              const updatedNotification = mapNotification(payload.new);

              setNotifications((prev) =>
                prev.map((item) =>
                  item.id === updatedNotification.id ? updatedNotification : item
                )
              );
            }

            loadUnreadNotificationCount(currentUserId);
          }
        )
        .subscribe();

      notificationChannelRef.current = channel;
    };

    setupNotificationChannel();

    return () => {
      cancelled = true;

      if (notificationChannelRef.current) {
        supabase.removeChannel(notificationChannelRef.current);
        notificationChannelRef.current = null;
      }
    };
  }, [currentUserId, loadUnreadNotificationCount]);

  const markAllAsRead = async () => {
    if (!currentUserId) return;

    const unreadIds = notifications
      .filter((item) => item.unread)
      .map((item) => item.id);

    if (unreadIds.length === 0) {
      setUnreadNotificationCount(0);
      return;
    }

    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        unread: false,
      }))
    );

    setUnreadNotificationCount(0);

    const { error } = await supabase
      .from("complaint_notifications")
      .update({ is_read: true })
      .in("id", unreadIds)
      .eq("citizen_id", currentUserId);

    if (error) {
      Alert.alert("Update Failed", error.message);
      loadNotifications(false);
      return;
    }

    await loadUnreadNotificationCount(currentUserId);
  };

  const markSingleAsRead = async (item) => {
    if (!item?.id || !currentUserId) return;

    if (!item.unread) return;

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === item.id
          ? {
              ...notification,
              unread: false,
            }
          : notification
      )
    );

    setUnreadNotificationCount((prev) => Math.max(prev - 1, 0));

    const { error } = await supabase
      .from("complaint_notifications")
      .update({ is_read: true })
      .eq("id", item.id)
      .eq("citizen_id", currentUserId);

    if (error) {
      console.log("Mark notification read error:", error);
      loadNotifications(false);
      return;
    }

    await loadUnreadNotificationCount(currentUserId);
  };

  const openRelatedComplaint = (item) => {
    if (!item.complaintId) return;

    router.push({
      pathname: "/citizen/complaints",
      params: {
        complaintId: item.complaintId,
        openDetails: "true",
      },
    });
  };

  const handleNotificationPress = async (item) => {
    await markSingleAsRead(item);
    openRelatedComplaint(item);
  };

  const handleActionPress = async (item) => {
    await markSingleAsRead(item);
    openRelatedComplaint(item);
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
            activeOpacity={0.7}
            style={styles.backButton}
            onPress={handleBack}
          >
            <Feather name="chevron-left" size={26} color={TEXT} />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerDescription}>
              Complaint updates, validation requests, and duplicate alerts.
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.topSummaryCard}>
            <View style={styles.summaryIconCircle}>
              <Ionicons name="notifications" size={27} color={WHITE} />

              {unreadNotificationCount > 0 && (
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.summaryTextBox}>
              <Text style={styles.summaryTitle}>
                {unreadNotificationCount > 0
                  ? `${unreadNotificationCount} unread notification${
                      unreadNotificationCount > 1 ? "s" : ""
                    }`
                  : "You're all caught up"}
              </Text>

              <Text style={styles.summarySubtitle}>{formattedDate}</Text>
            </View>

            {unreadNotificationCount > 0 && (
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.markReadButton}
                onPress={markAllAsRead}
              >
                <Text style={styles.markReadText}>Mark all read</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Updates</Text>

            <Text style={styles.sectionCount}>
              {loadingNotifications
                ? "Loading..."
                : `${notifications.length} total`}
            </Text>
          </View>

          {loadingNotifications ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-outline" size={38} color={MUTED} />

              <Text style={styles.emptyTitle}>No notifications yet</Text>

              <Text style={styles.emptyText}>
                Complaint updates will appear here in real time.
              </Text>
            </View>
          ) : (
            <View style={styles.notificationList}>
              {notifications.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.78}
                  style={[
                    styles.notificationCard,
                    item.unread && styles.notificationCardUnread,
                  ]}
                  onPress={() => handleNotificationPress(item)}
                >
                  {item.unread && <View style={styles.unreadDot} />}

                  <View
                    style={[
                      styles.notificationIconCircle,
                      { backgroundColor: item.iconBg },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={23}
                      color={item.iconColor}
                    />
                  </View>

                  <View style={styles.notificationBody}>
                    <View style={styles.notificationTopRow}>
                      <Text style={styles.notificationTitle} numberOfLines={1}>
                        {item.title}
                      </Text>

                      <Text style={styles.notificationTime}>{item.time}</Text>
                    </View>

                    <Text style={styles.notificationMessage} numberOfLines={3}>
                      {item.message}
                    </Text>

                    <View style={styles.notificationBottomRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: item.statusBg },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: item.statusColor },
                          ]}
                          numberOfLines={1}
                        >
                          {item.status}
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={[
                          styles.actionButton,
                          item.actionType === "details" &&
                            styles.viewDetailsButton,
                        ]}
                        onPress={(event) => {
                          event?.stopPropagation?.();
                          handleActionPress(item);
                        }}
                      >
                        <Text
                          style={[
                            styles.actionButtonText,
                            item.actionType === "details" &&
                              styles.viewDetailsButtonText,
                          ]}
                        >
                          {item.actionLabel}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomNav}>
          {bottomTabs.map((tab) => {
            const isActive =
              pathname?.includes(tab.activePath) ||
              (tab.label === "Home" &&
                (pathname === "/" || pathname?.includes("citizen/dashboard")));

            return (
              <TouchableOpacity
                key={tab.label}
                style={[styles.navItem, { flex: tab.flex }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (isActive) return;
                  router.replace(tab.route);
                }}
              >
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={26}
                  color={isActive ? GREEN : "#000000"}
                />

                <Text
                  style={[
                    styles.navLabel,
                    {
                      color: isActive ? GREEN : "#000000",
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
    minHeight: 62,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    marginTop: 0,
  },

  backButton: {
    width: 34,
    height: 34,
    alignItems: "flex-start",
    justifyContent: "center",
    marginRight: 6,
    marginTop: 6,
  },

  headerTitleBox: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    marginTop: 7,
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#15651E",
    lineHeight: 24,
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
    lineHeight: 14,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    paddingBottom: 116,
  },

  topSummaryCard: {
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  summaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    position: "relative",
  },

  summaryBadge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: GREEN,
  },

  summaryBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: WHITE,
  },

  summaryTextBox: {
    flex: 1,
  },

  summaryTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15.5,
    color: WHITE,
    lineHeight: 21,
  },

  summarySubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    letterSpacing: 0.3,
  },

  markReadButton: {
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: WHITE,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  markReadText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.5,
    color: GREEN,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: GREEN,
  },

  sectionCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
  },

  loadingCard: {
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
    marginTop: 10,
  },

  emptyCard: {
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: TEXT,
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    textAlign: "center",
    marginTop: 3,
  },

  notificationList: {
    gap: 10,
  },

  notificationCard: {
    position: "relative",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  notificationCardUnread: {
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
  },

  unreadDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RED,
  },

  notificationIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    marginTop: 2,
  },

  notificationBody: {
    flex: 1,
    paddingRight: 4,
  },

  notificationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: 12,
  },

  notificationTitle: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: TEXT,
    marginRight: 8,
  },

  notificationTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 9.2,
    color: MUTED,
  },

  notificationMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.2,
    color: "#333333",
    lineHeight: 17,
    marginTop: 4,
  },

  notificationBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },

  statusBadge: {
    minWidth: 88,
    maxWidth: 135,
    height: 25,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.2,
  },

  actionButton: {
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: GREEN,
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  actionButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.8,
    color: WHITE,
  },

  viewDetailsButton: {
    backgroundColor: LIGHT_GREEN,
  },

  viewDetailsButtonText: {
    color: GREEN,
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: Platform.OS === "ios" ? 38 : 32,
  },

  navItem: {
    height: 58,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },

  navLabel: {
    fontSize: 9.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },
});
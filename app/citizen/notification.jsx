import {
  Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Skeleton from "../../components/Skeleton";
import ComplaintsLoadMoreFooter from "../../components/ComplaintsLoadMoreFooter";
import { NotificationListSkeleton, PageSkeleton } from "../../components/skeletons";
import {
  buildNotificationPageQuery,
  computeNotificationHasMore,
  getNotificationPageSize,
  isNearContentBottom,
  mergeNotificationPages,
} from "../../lib/notificationPagination";
import { waitOffsetPageDelay } from "../../lib/complaintPagination";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { writeAuditLog } from "../../lib/auditLogService";
import { useScreenBottomInset } from "../../hooks/useScreenBottomInset";

// ===== [CITIZEN NOTIFS] Constants: colors, layout, cache key =====

const H_PADDING = 20;
const CITIZEN_NOTIFICATIONS_CACHE_KEY = "citizen.notifications";

// ===== [CITIZEN NOTIFS] Bottom tab config =====
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

// ===== [CITIZEN NOTIFS] Helpers: date, text, metadata, time formatting =====
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

// ===== [CITIZEN NOTIFS] Notification type -> badge/icon/action style =====
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
      statusBg: "rgba(243, 234, 255, 1)",
      statusColor: "rgba(122, 62, 168, 1)",
      icon: "clipboard-check-outline",
      iconBg: "rgba(243, 234, 255, 1)",
      iconColor: "rgba(122, 62, 168, 1)",
      actionLabel: "Provide Validation",
      actionType: "validation",
    };
  }

  if (normalizedType === "validation_reminder") {
    return {
      statusBg: "rgba(243, 234, 255, 1)",
      statusColor: "rgba(122, 62, 168, 1)",
      icon: "bell-ring-outline",
      iconBg: "rgba(243, 234, 255, 1)",
      iconColor: "rgba(122, 62, 168, 1)",
      actionLabel: "Validate Now",
      actionType: "validation",
    };
  }

  if (normalizedType === "routed" || normalizedType === "reassigned") {
    return {
      statusBg: "rgba(234, 246, 228, 1)",
      statusColor: "rgba(8, 122, 13, 1)",
      icon: "send-check-outline",
      iconBg: "rgba(234, 246, 228, 1)",
      iconColor: "rgba(8, 122, 13, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "category") {
    return {
      statusBg: "rgba(232, 238, 255, 1)",
      statusColor: "rgba(49, 90, 154, 1)",
      icon: "shape-outline",
      iconBg: "rgba(232, 238, 255, 1)",
      iconColor: "rgba(49, 90, 154, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "priority") {
    return {
      statusBg: "rgba(255, 242, 232, 1)",
      statusColor: "rgba(244, 162, 76, 1)",
      icon: "flag-outline",
      iconBg: "rgba(255, 242, 232, 1)",
      iconColor: "rgba(244, 162, 76, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "duplicate" || normalizedType === "similar") {
    return {
      statusBg: "rgba(232, 238, 255, 1)",
      statusColor: "rgba(49, 90, 154, 1)",
      icon: "alert-circle-outline",
      iconBg: "rgba(232, 238, 255, 1)",
      iconColor: "rgba(49, 90, 154, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "completed" || normalizedStatus === "completed") {
    return {
      statusBg: "rgba(234, 246, 228, 1)",
      statusColor: "rgba(8, 122, 13, 1)",
      icon: "check-circle-outline",
      iconBg: "rgba(234, 246, 228, 1)",
      iconColor: "rgba(8, 122, 13, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedType === "ai_validation") {
    const rejected =
      normalizedStatus === "rejected" ||
      normalizeText(metadata.ai_status) === "rejected";

    if (rejected) {
      return {
        statusBg: "rgba(255, 240, 240, 1)",
        statusColor: "rgba(215, 25, 32, 1)",
        icon: "close-circle-outline",
        iconBg: "rgba(255, 240, 240, 1)",
        iconColor: "rgba(215, 25, 32, 1)",
        actionLabel: "View Details",
        actionType: "details",
      };
    }

    return {
      statusBg: "rgba(234, 246, 228, 1)",
      statusColor: "rgba(8, 122, 13, 1)",
      icon: "check-decagram-outline",
      iconBg: "rgba(234, 246, 228, 1)",
      iconColor: "rgba(8, 122, 13, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedStatus === "for validation") {
    return {
      statusBg: "rgba(243, 234, 255, 1)",
      statusColor: "rgba(122, 62, 168, 1)",
      icon: "clipboard-check-outline",
      iconBg: "rgba(243, 234, 255, 1)",
      iconColor: "rgba(122, 62, 168, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (normalizedStatus === "in progress") {
    return {
      statusBg: "rgba(255, 248, 214, 1)",
      statusColor: "rgba(201, 160, 0, 1)",
      icon: "progress-wrench",
      iconBg: "rgba(255, 248, 214, 1)",
      iconColor: "rgba(201, 160, 0, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  if (
    normalizedStatus === "returned" ||
    normalizedType === "returned" ||
    normalizedType === "returned_by_admin"
  ) {
    return {
      statusBg: "rgba(255, 240, 240, 1)",
      statusColor: "rgba(215, 25, 32, 1)",
      icon: "arrow-u-left-top",
      iconBg: "rgba(255, 240, 240, 1)",
      iconColor: "rgba(215, 25, 32, 1)",
      actionLabel: "Resubmit Validation",
      actionType: "details",
    };
  }

  if (normalizedType === "submitted") {
    return {
      statusBg: "rgba(232, 238, 255, 1)",
      statusColor: "rgba(49, 90, 154, 1)",
      icon: "file-document-outline",
      iconBg: "rgba(232, 238, 255, 1)",
      iconColor: "rgba(49, 90, 154, 1)",
      actionLabel: "View Details",
      actionType: "details",
    };
  }

  return {
    statusBg: "rgba(232, 238, 255, 1)",
    statusColor: "rgba(49, 90, 154, 1)",
    icon: "bell-outline",
    iconBg: "rgba(232, 238, 255, 1)",
    iconColor: "rgba(49, 90, 154, 1)",
    actionLabel: "View Details",
    actionType: "details",
  };
}

// ===== [CITIZEN NOTIFS] Map DB notification row -> UI notification object =====
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

// ===== [CITIZEN NOTIFS] Screen component =====
export default function CitizenNotification() {
  // --- [CITIZEN NOTIFS] State, refs & navigation ---
  const router = useRouter();
  const pathname = usePathname();
  const scrollBottomInset = useScreenBottomInset({ includeNav: false });

  const cachedNotifications = getPageCache(CITIZEN_NOTIFICATIONS_CACHE_KEY);
  const [notifications, setNotifications] = useState(
    cachedNotifications?.notifications ?? []
  );
  const [notificationsTotal, setNotificationsTotal] = useState(
    cachedNotifications?.notificationsTotal ??
      cachedNotifications?.notifications?.length ??
      0
  );
  const [loadingNotifications, setLoadingNotifications] = useState(
    !cachedNotifications
  );
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(
    cachedNotifications?.hasMore !== false
  );
  const [currentUserId, setCurrentUserId] = useState(
    cachedNotifications?.currentUserId ?? null
  );
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    cachedNotifications?.unreadNotificationCount ?? 0
  );
  const notificationChannelRef = useRef(null);
  const notificationsDataRef = useRef(cachedNotifications?.notifications ?? []);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(cachedNotifications?.hasMore !== false);
  const listViewportHeightRef = useRef(0);
  const loadNotificationsRef = useRef(null);

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

  // --- [CITIZEN NOTIFS] Unread count ---
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

  useEffect(() => {
    notificationsDataRef.current = notifications;
  }, [notifications]);

  // --- [CITIZEN NOTIFS] Load notifications (cached + paginated) ---
  const loadNotifications = useCallback(
    async (options = {}) => {
      const normalized =
        typeof options === "boolean" ? { showLoader: options } : options;
      const append = normalized.append === true;
      const cached = !append ? getPageCache(CITIZEN_NOTIFICATIONS_CACHE_KEY) : null;

      if (!append && cached) {
        setNotifications(cached.notifications ?? []);
        setNotificationsTotal(
          cached.notificationsTotal ?? cached.notifications?.length ?? 0
        );
        hasMoreRef.current = cached.hasMore !== false;
        setHasMoreNotifications(cached.hasMore !== false);
      }

      const showLoader =
        normalized.showLoader ??
        (!append && shouldShowPageLoader(CITIZEN_NOTIFICATIONS_CACHE_KEY));

      if (append) {
        if (loadingMoreRef.current || !hasMoreRef.current) {
          return;
        }

        loadingMoreRef.current = true;
        setLoadingMoreNotifications(true);
      } else {
        hasMoreRef.current = cached?.hasMore !== false;
      }

      try {
        if (showLoader) {
          setLoadingNotifications(true);
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (!cached) {
            setCurrentUserId(null);
            setNotifications([]);
            setNotificationsTotal(0);
            setUnreadNotificationCount(0);
            hasMoreRef.current = false;
            setHasMoreNotifications(false);
          }
          return;
        }

        setCurrentUserId(user.id);

        const offset = append ? notificationsDataRef.current.length : 0;
        const pageSize = getNotificationPageSize(
          append,
          cached?.notifications?.length || 0
        );

        await waitOffsetPageDelay(offset);

        const { data, error, count } = await buildNotificationPageQuery(supabase, {
          role: "citizen",
          ownerId: user.id,
          offset,
          pageSize,
        });

        if (error) {
          notify("Load Failed", error.message);
          if (!cached) {
            setNotifications([]);
            setNotificationsTotal(0);
            setUnreadNotificationCount(0);
            hasMoreRef.current = false;
            setHasMoreNotifications(false);
          }
          return;
        }

        const mappedNotifications = (data || []).map(mapNotification);
        const nextNotifications = append
          ? mergeNotificationPages(
              notificationsDataRef.current,
              mappedNotifications,
              (item) => item.id
            )
          : mappedNotifications;

        const total = count ?? nextNotifications.length;
        const loadedCount = nextNotifications.length;
        const hasMore = computeNotificationHasMore(
          mappedNotifications,
          loadedCount,
          total
        );

        setNotifications(nextNotifications);
        setNotificationsTotal(total);
        hasMoreRef.current = hasMore;
        setHasMoreNotifications(hasMore);
        setPageCache(CITIZEN_NOTIFICATIONS_CACHE_KEY, {
          notifications: nextNotifications,
          notificationsTotal: total,
          hasMore,
          currentUserId: user.id,
        });

        await loadUnreadNotificationCount(user.id);
      } catch (error) {
        console.log("Load notifications error:", error);
        if (!cached) {
          notify("Load Failed", "Unable to load notifications.");
          setNotifications([]);
          setNotificationsTotal(0);
          setUnreadNotificationCount(0);
          hasMoreRef.current = false;
          setHasMoreNotifications(false);
        }
      } finally {
        if (append) {
          loadingMoreRef.current = false;
          setLoadingMoreNotifications(false);
        }
        setLoadingNotifications(false);
      }
    },
    [loadUnreadNotificationCount]
  );

  useEffect(() => {
    loadNotificationsRef.current = loadNotifications;
  }, [loadNotifications]);

  // --- [CITIZEN NOTIFS] Infinite scroll / load more ---
  const loadMoreNotifications = useCallback(() => {
    loadNotifications({ append: true, showLoader: false });
  }, [loadNotifications]);

  const handleNotificationsScroll = ({ nativeEvent }) => {
    if (isNearContentBottom(nativeEvent)) {
      loadMoreNotifications();
    }
  };

  const maybeFillViewport = (contentHeight) => {
    if (
      hasMoreRef.current &&
      !loadingMoreRef.current &&
      !loadingNotifications &&
      listViewportHeightRef.current > 0 &&
      contentHeight < listViewportHeightRef.current + 80
    ) {
      loadMoreNotifications();
    }
  };

  // --- [CITIZEN NOTIFS] Initial load & reload on focus ---
  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(false);
    }, [loadNotifications])
  );

  // --- [CITIZEN NOTIFS] Realtime: subscribe to notification changes ---
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

  // --- [CITIZEN NOTIFS] Mark all as read ---
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
      notify("Update Failed", error.message);
      loadNotifications(false);
      return;
    }

    await loadUnreadNotificationCount(currentUserId);
    writeAuditLog({
      action: "notifications_read",
      title: "Notifications Marked as Read",
      description: "All citizen notifications were marked as read.",
      actorRole: "citizen",
    });
  };

  // --- [CITIZEN NOTIFS] Mark single as read ---
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

  // --- [CITIZEN NOTIFS] Open related complaint & press handlers ---
  const openRelatedComplaint = (item) => {
    if (!item.complaintId) return;

    const status = String(item.status || "").trim();
    const normalizedType = normalizeText(item.type);
    const needsValidation =
      normalizedType === "validation_reminder" ||
      normalizedType === "validation" ||
      status === "For Validation";

    router.push({
      pathname: "/citizen/complaints",
      params: {
        complaintId: item.complaintId,
        openDetails: needsValidation ? undefined : "true",
        openValidation: needsValidation ? "true" : undefined,
        filter: needsValidation
          ? "For Validation"
          : status === "Returned"
            ? "Returned"
            : undefined,
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

  // --- [CITIZEN NOTIFS] Loading skeleton ---
  if (!fontsLoaded && !cachedNotifications) {
    return <PageSkeleton variant="notifications" />;
  }

  // --- [CITIZEN NOTIFS] Render ---
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(255, 255, 255, 1)" />

      <View style={styles.mainContainer}>
        {/* [CITIZEN NOTIFS UI] Sticky header */}
        <View style={styles.stickyHeader}>
          {/* [CITIZEN NOTIFS UI] Header: back button & title */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.backButton}
              onPress={handleBack}
            >
              <Feather name="chevron-left" size={26} color="rgba(23, 23, 23, 1)" />
            </TouchableOpacity>

            <View style={styles.headerTitleBox}>
              <Text style={styles.headerTitle}>Notifications</Text>
              <Text style={styles.headerDescription}>
                Complaint updates, validation requests, and duplicate notifications.
              </Text>
            </View>
          </View>

          {/* [CITIZEN NOTIFS UI] Summary card: unread count & mark all read */}
          <View style={styles.topSummaryCard}>
            <View style={styles.summaryIconCircle}>
              <Ionicons name="notifications" size={27} color="rgba(255, 255, 255, 1)" />

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

          {/* [CITIZEN NOTIFS UI] Section row: Recent Updates & total */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent Updates</Text>
            {loadingNotifications && notifications.length === 0 ? (
              <Skeleton width={72} height={12} borderRadius={6} />
            ) : (
              <Text style={styles.sectionCount}>
                {`${notificationsTotal} total`}
              </Text>
            )}
          </View>
        </View>

        {/* [CITIZEN NOTIFS UI] Notification list scroll */}
        <ScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomInset },
          ]}
          scrollEventThrottle={16}
          onScroll={handleNotificationsScroll}
          onLayout={(event) => {
            listViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, height) => maybeFillViewport(height)}
        >
          {/* [CITIZEN NOTIFS UI] Loading skeleton / empty state / notification list */}
          {loadingNotifications && notifications.length === 0 ? (
            <NotificationListSkeleton count={5} />
          ) : notifications.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-outline" size={38} color="rgba(111, 119, 111, 1)" />

              <Text style={styles.emptyTitle}>No notifications yet</Text>

              <Text style={styles.emptyText}>
                Complaint updates will appear here in real time.
              </Text>
            </View>
          ) : (
            <View style={styles.notificationList}>
              {/* [CITIZEN NOTIFS UI] Notification cards */}
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

                  {/* [CITIZEN NOTIFS UI] Card icon */}
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

                  {/* [CITIZEN NOTIFS UI] Card body: title, time, message */}
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

                    {/* [CITIZEN NOTIFS UI] Status badge & action button */}
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
              {/* [CITIZEN NOTIFS UI] Load more footer */}
              <ComplaintsLoadMoreFooter
                loading={loadingMoreNotifications}
                label="Loading more notifications..."
              />
            </View>
          )}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

// ===== [CITIZEN NOTIFS] Styles =====
const styles = StyleSheet.create({
  // --- Layout & header ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  stickyHeader: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226, 231, 224, 1)",
    zIndex: 2,
  },

  listScroll: {
    flex: 1,
  },

  loader: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 8,
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
    color: "rgba(21, 101, 30, 1)",
    lineHeight: 24,
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 1,
    lineHeight: 14,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
  },

  // --- Summary card ---
  topSummaryCard: {
    minHeight: 88,
    borderRadius: 18,
    backgroundColor: "rgba(8, 122, 13, 1)",
    paddingHorizontal: 16,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "rgba(0, 0, 0, 1)",
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
    backgroundColor: "rgba(215, 25, 32, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "rgba(8, 122, 13, 1)",
  },

  summaryBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: "rgba(255, 255, 255, 1)",
  },

  summaryTextBox: {
    flex: 1,
  },

  summaryTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15.5,
    color: "rgba(255, 255, 255, 1)",
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
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  markReadText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.5,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Section row, loading & empty states ---
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "rgba(8, 122, 13, 1)",
  },

  sectionCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
  },

  loadingCard: {
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 10,
  },

  emptyCard: {
    minHeight: 180,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    marginTop: 3,
  },

  notificationList: {
  // --- Notification cards ---
    gap: 10,
  },

  notificationCard: {
    position: "relative",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 13,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "flex-start",
  },

  notificationCardUnread: {
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
  },

  unreadDot: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(215, 25, 32, 1)",
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
    color: "rgba(23, 23, 23, 1)",
    marginRight: 8,
  },

  notificationTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 9.2,
    color: "rgba(111, 119, 111, 1)",
  },

  notificationMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.2,
    color: "rgba(51, 51, 51, 1)",
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
    backgroundColor: "rgba(8, 122, 13, 1)",
    paddingHorizontal: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  actionButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.8,
    color: "rgba(255, 255, 255, 1)",
  },

  viewDetailsButton: {
    backgroundColor: "rgba(234, 246, 228, 1)",
  },

  viewDetailsButtonText: {
    color: "rgba(8, 122, 13, 1)",
  },

  bottomNav: {
  // --- Bottom nav ---
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopWidth: 1,
    borderTopColor: "rgba(229, 229, 229, 1)",
    shadowColor: "rgba(0, 0, 0, 1)",
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
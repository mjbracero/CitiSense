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
  ActivityIndicator,
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
import { NotificationListSkeleton, PageSkeleton } from "../../components/skeletons";
import ComplaintsLoadMoreFooter from "../../components/ComplaintsLoadMoreFooter";
import {
  buildNotificationPageQuery,
  computeNotificationHasMore,
  getNotificationCacheKey,
  getNotificationPageSize,
  isNearContentBottom,
  mergeNotificationPages,
} from "../../lib/notificationPagination";
import { waitOffsetPageDelay } from "../../lib/complaintPagination";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { writeAuditLog } from "../../lib/auditLogService";
import { backfillDepartmentHeadAssignmentNotifications } from "../../lib/departmentHeadNotificationService";
import { resolveDepartmentHeadOffice } from "../../lib/complaintCategories";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

// ===== [DEPT NOTIFS] Constants: colors, layout, cache key =====

const H_PADDING = 20;
const DEPT_NOTIFICATIONS_CACHE_KEY = "departmentHead.notifications";

// ===== [DEPT NOTIFS] Filter chips & bottom tab config =====
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

// ===== [DEPT NOTIFS] Helpers: text, metadata, date/time formatting =====
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

// ===== [DEPT NOTIFS] Notification type mapping (label, colors, icon) =====
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
    cleanType === "thank_you" ||
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
      bg: "rgba(232, 238, 255, 1)",
      color: "rgba(49, 90, 154, 1)",
      icon: "clipboard-text-outline",
    };
  }

  if (displayType === "Reassigned") {
    return {
      bg: "rgba(234, 246, 228, 1)",
      color: "rgba(8, 122, 13, 1)",
      icon: "swap-horizontal-circle-outline",
    };
  }

  if (displayType === "Completed") {
    return {
      bg: "rgba(234, 246, 228, 1)",
      color: "rgba(8, 122, 13, 1)",
      icon: "check-circle-outline",
    };
  }

  if (displayType === "Returned") {
    return {
      bg: "rgba(255, 240, 240, 1)",
      color: "rgba(215, 25, 32, 1)",
      icon: "arrow-u-left-top",
    };
  }

  if (displayType === "Validation") {
    return {
      bg: "rgba(243, 234, 255, 1)",
      color: "rgba(122, 62, 168, 1)",
      icon: "clipboard-check-outline",
    };
  }

  return {
    bg: "rgba(241, 244, 241, 1)",
    color: "rgba(111, 119, 111, 1)",
    icon: "bell-outline",
  };
}

// ===== [DEPT NOTIFS] Map DB notification row -> UI object =====
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
    returnReason: metadata.return_reason || "",
    citizenFeedback: metadata.citizen_feedback || "",
    citizenValidationAnswer: metadata.citizen_validation_answer || "",
    date: formatDate(row.created_at),
    time: formatTime(row.created_at),
    unread: row.is_read === false,
    createdAt: row.created_at,
    metadata,
    typeStyle,
  };
}

// ===== [DEPT NOTIFS] Screen component =====
export default function DepartmentHeadNotification() {
  // --- [DEPT NOTIFS] Navigation & unread count ---
  const router = useRouter();
  const pathname = usePathname();

  const {
    unreadNotificationCount,
    reloadUnreadNotificationCount,
    resetUnreadNotificationCount,
  } = useDepartmentHeadUnreadNotifications();

  // --- [DEPT NOTIFS] State & refs (seeded from page cache) ---
  const cachedNotifications = getPageCache(DEPT_NOTIFICATIONS_CACHE_KEY);
  const [notifications, setNotifications] = useState(
    cachedNotifications?.notifications ?? []
  );
  const [notificationsTotal, setNotificationsTotal] = useState(
    cachedNotifications?.notificationsTotal ??
      cachedNotifications?.notifications?.length ??
      0
  );
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [currentDepartmentHeadId, setCurrentDepartmentHeadId] = useState(
    cachedNotifications?.currentDepartmentHeadId ?? null
  );
  const [loadingNotifications, setLoadingNotifications] = useState(
    !cachedNotifications
  );
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(
    cachedNotifications?.hasMore !== false
  );
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useHideBottomNav(detailsVisible);

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);
  const notificationChannelRef = useRef(null);
  const loadNotificationsRef = useRef(null);
  const reloadUnreadRef = useRef(null);
  const notificationsDataRef = useRef(cachedNotifications?.notifications ?? []);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(cachedNotifications?.hasMore !== false);
  const listViewportHeightRef = useRef(0);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [DEPT NOTIFS] Navigation lock helper ---
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

  useEffect(() => {
    notificationsDataRef.current = notifications;
  }, [notifications]);

  // --- [DEPT NOTIFS] Load notifications (cache, backfill, paginated query) ---
  const loadNotifications = useCallback(async (options = {}) => {
    const normalized =
      typeof options === "boolean" ? { showLoader: options } : options;
    const append = normalized.append === true;
    const cacheKey = getNotificationCacheKey(
      DEPT_NOTIFICATIONS_CACHE_KEY,
      selectedFilter
    );
    const cached = !append ? getPageCache(cacheKey) : null;

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
      (!append && shouldShowPageLoader(cacheKey));

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

      if (userError || !user?.id) {
        if (!cached) {
          setCurrentDepartmentHeadId(null);
          setNotifications([]);
          setNotificationsTotal(0);
          hasMoreRef.current = false;
          setHasMoreNotifications(false);
        }
        return;
      }

      setCurrentDepartmentHeadId(user.id);

      if (!append) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("department")
            .eq("id", user.id)
            .maybeSingle();

          const department =
            resolveDepartmentHeadOffice(profile?.department) ||
            resolveDepartmentHeadOffice(
              user.user_metadata?.department ||
                user.user_metadata?.assigned_office ||
                user.user_metadata?.office ||
                ""
            );

          if (department) {
            const backfill =
              await backfillDepartmentHeadAssignmentNotifications({
                departmentHeadId: user.id,
                department,
              });

            if (backfill?.createdCount > 0) {
              reloadUnreadRef.current?.();
            }
          }
        } catch (backfillError) {
          console.log(
            "Department head notification backfill error:",
            backfillError
          );
        }
      }

      const offset = append ? notificationsDataRef.current.length : 0;
      const pageSize = getNotificationPageSize(
        append,
        cached?.notifications?.length || 0
      );

      await waitOffsetPageDelay(offset);

      const { data, error, count } = await buildNotificationPageQuery(supabase, {
        role: "departmentHead",
        ownerId: user.id,
        offset,
        pageSize,
        selectedFilter,
      });

      if (error) {
        console.log("Load department head notifications error:", error);
        if (!cached) {
          setNotifications([]);
          setNotificationsTotal(0);
          hasMoreRef.current = false;
          setHasMoreNotifications(false);
        }
        return;
      }

      const mapped = (data || []).map(mapNotification);
      const nextNotifications = append
        ? mergeNotificationPages(
            notificationsDataRef.current,
            mapped,
            (item) => item.id
          )
        : mapped;

      const total = count ?? nextNotifications.length;
      const loadedCount = nextNotifications.length;
      const hasMore = computeNotificationHasMore(mapped, loadedCount, total);

      setNotifications(nextNotifications);
      setNotificationsTotal(total);
      hasMoreRef.current = hasMore;
      setHasMoreNotifications(hasMore);
      setPageCache(cacheKey, {
        notifications: nextNotifications,
        notificationsTotal: total,
        hasMore,
        currentDepartmentHeadId: user.id,
        selectedFilter,
      });
    } catch (error) {
      console.log("Load moderator notifications catch error:", error);
      if (!cached) {
        setNotifications([]);
        setNotificationsTotal(0);
        hasMoreRef.current = false;
        setHasMoreNotifications(false);
      }
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMoreNotifications(false);
      }
      setLoadingNotifications(false);
      setRefreshing(false);
    }
  }, [selectedFilter]);

  // --- [DEPT NOTIFS] Infinite scroll / load more ---
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

  // --- [DEPT NOTIFS] Initial load & reload on focus ---
  useEffect(() => {
    loadNotificationsRef.current = loadNotifications;
  }, [loadNotifications]);

  useEffect(() => {
    reloadUnreadRef.current = reloadUnreadNotificationCount;
  }, [reloadUnreadNotificationCount]);

  useEffect(() => {
    loadNotifications(true);
  }, [loadNotifications]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications(false);
      reloadUnreadNotificationCount?.();
    }, [loadNotifications, reloadUnreadNotificationCount])
  );

  // --- [DEPT NOTIFS] Realtime: moderator_notifications subscription ---
  useEffect(() => {
    if (!currentDepartmentHeadId) return;

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
            item.topic ===
            `realtime:moderator-notifications-ui-${currentDepartmentHeadId}`
        );

      if (staleChannel) {
        await supabase.removeChannel(staleChannel);
      }

      if (cancelled) return;

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
            loadNotificationsRef.current?.(false);
            reloadUnreadRef.current?.();
          }
        )
        .subscribe((status) => {
          console.log("Department head notifications realtime status:", status);
        });

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
  }, [currentDepartmentHeadId]);

  // --- [DEPT NOTIFS] Filtered list & pull-to-refresh ---
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

  // --- [DEPT NOTIFS] Mark read (single / all) ---
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
        notify("Update Failed", error.message);
        loadNotifications(false);
        reloadUnreadNotificationCount?.();
        return;
      }

      await reloadUnreadNotificationCount?.();
      await loadNotifications(false);
      writeAuditLog({
        action: "notifications_read",
        title: "Notifications Marked as Read",
        description: "All department head notifications were marked as read.",
        actorRole: "moderator",
      });
    } catch (error) {
      console.log("Mark all moderator notifications read error:", error);
      notify("Update Failed", "Unable to mark notifications as read.");
      loadNotifications(false);
      reloadUnreadNotificationCount?.();
    } finally {
      setMarkingAllRead(false);
    }
  };

  // --- [DEPT NOTIFS] Details modal & open related complaint ---
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

  // --- [DEPT NOTIFS] Render ---
  if (!fontsLoaded && !cachedNotifications) {
    return <PageSkeleton variant="notifications" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [DEPT NOTIFS UI] Sticky header: title + mark all read */}
        <View style={styles.stickyHeader}>
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
                  <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" />
                ) : (
                  <Text style={styles.markAllButtonText}>Mark all read</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* [DEPT NOTIFS UI] Filter chips */}
          <ScrollView
            horizontal
            nestedScrollEnabled
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
        </View>

        {/* [DEPT NOTIFS UI] Notification list (pull-to-refresh + infinite scroll) */}
        <ScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="rgba(8, 122, 13, 1)"
              colors={["rgba(8, 122, 13, 1)"]}
            />
          }
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={handleNotificationsScroll}
          onLayout={(event) => {
            listViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, height) => maybeFillViewport(height)}
        >
          <View style={styles.notificationList}>
            {/* [DEPT NOTIFS UI] Loading skeleton / empty state / notification cards */}
            {loadingNotifications && notifications.length === 0 ? (
              <NotificationListSkeleton count={5} />
            ) : filteredNotifications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="notifications-off-outline"
                  size={34}
                  color="rgba(111, 119, 111, 1)"
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

                      <Text style={styles.notificationMessage} numberOfLines={item.returnReason ? 3 : 2}>
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
            {/* [DEPT NOTIFS UI] Load-more footer */}
            <ComplaintsLoadMoreFooter
              loading={loadingMoreNotifications}
              label="Loading more notifications..."
            />
          </View>
        </ScrollView>

        {/* [DEPT NOTIFS UI] Notification details modal */}
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
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
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

                  {/* [DEPT NOTIFS UI] Details: message & citizen feedback */}
                  <View style={styles.messageBox}>
                    <Text style={styles.infoLabel}>Message</Text>
                    <Text style={styles.messageText}>
                      {selectedNotification.message}
                    </Text>
                  </View>

                  {selectedNotification.citizenFeedback ? (
                    <View style={styles.citizenFeedbackBox}>
                      <Text style={styles.infoLabel}>Citizen Feedback</Text>
                      <Text style={styles.messageText}>
                        {selectedNotification.citizenFeedback}
                      </Text>
                    </View>
                  ) : null}

                  {/* [DEPT NOTIFS UI] Details: complaint information rows */}
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

                  {/* [DEPT NOTIFS UI] Details: view assigned complaint button */}
                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.viewComplaintButton}
                    onPress={() => openRelatedComplaint(selectedNotification)}
                  >
                    <Text style={styles.viewComplaintButtonText}>
                      View Assigned Complaint
                    </Text>
                    <Feather name="arrow-right" size={17} color="rgba(255, 255, 255, 1)" />
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

// ===== [DEPT NOTIFS] Subcomponent: InfoRow =====
function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "N/A"}</Text>
    </View>
  );
}

// ===== [DEPT NOTIFS] Styles =====
const styles = StyleSheet.create({
  // --- Layout & header ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  stickyHeader: {
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
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
    backgroundColor: "rgba(247, 250, 246, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  headerTopRow: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: "rgba(8, 122, 13, 1)",
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  markAllButton: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  markAllButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Filter chips ---
  filterScrollContent: {
    gap: 8,
    paddingRight: 10,
  },

  filterChip: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },

  filterChipActive: {
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderColor: "rgba(8, 122, 13, 1)",
  },

  filterChipText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(23, 23, 23, 1)",
  },

  filterChipTextActive: {
    color: "rgba(255, 255, 255, 1)",
  },

  // --- Notification cards ---
  notificationList: {
    gap: 10,
  },

  notificationCard: {
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  notificationCardUnread: {
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
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
    color: "rgba(23, 23, 23, 1)",
  },

  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(215, 25, 32, 1)",
  },

  notificationMessage: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.8,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 15,
    marginTop: 2,
  },

  complaintTitleText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.2,
    color: "rgba(23, 23, 23, 1)",
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
    color: "rgba(111, 119, 111, 1)",
  },

  // --- Empty state ---
  emptyCard: {
    minHeight: 150,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 3,
  },

  // --- Legacy bottom nav ---
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopWidth: 1,
    borderTopColor: "rgba(226, 231, 224, 1)",
    shadowColor: "rgba(0, 0, 0, 1)",
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
    backgroundColor: "rgba(215, 25, 32, 1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: "rgba(255, 255, 255, 1)",
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

  // --- Details modal ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },

  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "rgba(215, 215, 215, 1)",
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
    color: "rgba(8, 122, 13, 1)",
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(247, 250, 246, 1)",
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
    color: "rgba(23, 23, 23, 1)",
    lineHeight: 22,
  },

  detailsSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 3,
  },

  messageBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },

  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(51, 51, 51, 1)",
    lineHeight: 18,
    marginTop: 3,
  },

  citizenFeedbackBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },

  complaintInfoCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 14,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(8, 122, 13, 1)",
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
    color: "rgba(8, 122, 13, 1)",
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(23, 23, 23, 1)",
    lineHeight: 16,
    marginTop: 1,
  },

  viewComplaintButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(8, 122, 13, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },

  viewComplaintButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: "rgba(255, 255, 255, 1)",
  },
});

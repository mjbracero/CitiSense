import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BOTTOM_NAV_CONTENT_INSET } from "../../components/PersistentBottomNav";
import {
  DashboardStatsSkeleton,
  PageSkeleton,
} from "../../components/skeletons";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";
import {
  COMPLAINT_CATEGORY_NAMES,
  DEPARTMENT_OFFICES,
} from "../../lib/complaintCategories";
import {
  countComplaints,
  countComplaintsMany,
} from "../../lib/complaintCountService";
import {
  ensureDashboardCacheHydrated,
  getPageCache,
  setPageCache,
  shouldShowPageLoader,
} from "../../lib/pageDataCache";
import {
  getProfileAvatarUrl,
  subscribeProfileAvatar,
} from "../../lib/profileAvatarStore";
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";
import { supabase } from "../../lib/supabase";

// ===== [ADMIN DASHBOARD] Constants: logo, colors, layout, cache key =====
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

const H_PADDING = 20;
const CARD_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP * 3) / 4;
const ADMIN_DASHBOARD_CACHE_KEY = "admin.dashboard";

// ===== [ADMIN DASHBOARD] Stat card config, priority order, bottom tabs =====
const dashboardCardConfig = [
  {
    title: "Total Complaints",
    key: "total",
    filter: "All Status",
    icon: "clipboard-text-outline",
  },
  {
    title: "Pending Complaints",
    key: "pending",
    filter: "Pending",
    icon: "clock-outline",
  },
  {
    title: "For Validation",
    key: "forValidation",
    filter: "For Validation",
    icon: "account-check-outline",
  },
  {
    title: "Completed",
    key: "completed",
    filter: "Completed",
    icon: "check-circle-outline",
  },
];

const priorityOrder = ["Critical", "Urgent", "High", "Normal", "Low"];

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

// ===== [ADMIN DASHBOARD] Helpers: normalize priority, greeting, priority colors =====
function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizePriority(priority) {
  const clean = normalizeText(priority);

  if (clean === "critical") return "Critical";
  if (clean === "urgent") return "Urgent";
  if (clean === "high") return "High";
  if (clean === "low") return "Low";
  if (clean === "normal" || clean === "medium") return "Normal";

  return "Normal";
}

function getGreetingByTime(date) {
  const hour = date.getHours();

  if (hour >= 0 && hour < 12) return "Maayong Buntag,";
  if (hour >= 12 && hour < 13) return "Maayong Udto,";
  if (hour >= 13 && hour < 18) return "Maayong Hapon,";

  return "Maayong Gabii,";
}

function getPriorityStyle(priority) {
  const normalizedPriority = normalizePriority(priority);

  if (normalizedPriority === "Critical") return { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" };
  if (normalizedPriority === "Urgent") return { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" };
  if (normalizedPriority === "High") return { bg: "rgba(255, 242, 232, 1)", color: "rgba(244, 162, 76, 1)" };
  if (normalizedPriority === "Normal") return { bg: "rgba(234, 246, 228, 1)", color: "rgba(8, 122, 13, 1)" };
  if (normalizedPriority === "Low") return { bg: "rgba(241, 244, 241, 1)", color: "rgba(49, 90, 154, 1)" };

  return { bg: "rgba(234, 246, 228, 1)", color: "rgba(8, 122, 13, 1)" };
}

// ===== [ADMIN DASHBOARD] Chart helpers: leading/least, category labels & chart data =====
function getLeadingAndLeast(stats) {
  if (!stats.length) {
    return {
      leading: { label: "No data yet", count: 0, percent: 0 },
      least: { label: "No data yet", count: 0, percent: 0 },
    };
  }

  const sortedDesc = [...stats].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  const sortedAsc = [...stats].sort(
    (a, b) => a.count - b.count || a.label.localeCompare(b.label),
  );

  return {
    leading: sortedDesc[0],
    least: sortedAsc[0],
  };
}

function getCategoryShortLabel(label) {
  const clean = String(label || "Unspecified")
    .replace(/ Concerns/gi, "")
    .replace(/Road and Infrastructure/gi, "Road")
    .replace(/Drainage and Flooding/gi, "Drainage")
    .replace(/Waste and Environmental/gi, "Waste")
    .replace(/Traffic and Road Safety/gi, "Traffic")
    .replace(/Streetlight/gi, "Streetlight")
    .replace(/Health and Sanitation/gi, "Health")
    .replace(/Disaster and Emergency/gi, "Disaster")
    .replace(/Peace and Order/gi, "Peace")
    .replace(/Coastal and Marine Protection/gi, "Coastal")
    .trim();

  if (clean.length <= 12) return clean;

  const firstWord = clean.split(" ")[0];
  return firstWord.length > 12 ? `${firstWord.slice(0, 10)}…` : firstWord;
}

function getCategoryChartData(categoryStats) {
  if (categoryStats.length <= 6) return categoryStats;

  const topFive = categoryStats.slice(0, 5);
  const least = [...categoryStats].sort(
    (a, b) => a.count - b.count || a.label.localeCompare(b.label),
  )[0];

  const merged = [...topFive];

  if (least && !merged.some((item) => item.label === least.label)) {
    merged.push(least);
  }

  return merged.slice(0, 6);
}

// ===== [ADMIN DASHBOARD] Supabase count loaders: cards, categories, priorities, departments =====
async function loadDashboardCardCounts() {
  return countComplaintsMany([
    { key: "total" },
    {
      key: "pending",
      buildQuery: (query) => query.eq("status", "Pending"),
    },
    {
      key: "assigned",
      buildQuery: (query) => query.eq("status", "Assigned"),
    },
    {
      key: "forValidation",
      buildQuery: (query) => query.eq("status", "For Validation"),
    },
    {
      key: "validated",
      buildQuery: (query) => query.eq("status", "Validated"),
    },
    {
      key: "completed",
      buildQuery: (query) => query.eq("status", "Completed"),
    },
  ]).then((counts) => ({
    total: counts.total || 0,
    pending: (counts.pending || 0) + (counts.assigned || 0),
    forValidation: (counts.forValidation || 0) + (counts.validated || 0),
    completed: counts.completed || 0,
  }));
}

async function loadDashboardCategoryStats(total) {
  const results = await Promise.all(
    COMPLAINT_CATEGORY_NAMES.map(async (category) => {
      const count = await countComplaints((query) =>
        query.eq("category", category),
      );
      return {
        label: category,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }),
  );

  return results
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function loadDashboardPriorityStats(total) {
  const results = await Promise.all(
    priorityOrder.map(async (priority) => {
      const count = await countComplaints((query) =>
        query.eq("priority", priority),
      );
      return {
        label: priority,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    }),
  );

  return results.filter((item) => item.count > 0);
}

async function loadDashboardDepartmentStats() {
  const results = await Promise.all(
    DEPARTMENT_OFFICES.map(async (office) => {
      const [count, completed] = await Promise.all([
        countComplaints((query) =>
          query.ilike("assigned_office", `%${office}%`),
        ),
        countComplaints((query) =>
          query
            .ilike("assigned_office", `%${office}%`)
            .eq("status", "Completed"),
        ),
      ]);

      return {
        label: office,
        count,
        completed,
        percent: count > 0 ? Math.round((completed / count) * 100) : 0,
      };
    }),
  );

  return results
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        b.percent - a.percent || b.completed - a.completed || b.count - a.count,
    );
}

// ===== [ADMIN DASHBOARD] Subcomponents: mini card, category graph, priority row, report button =====
function SummaryMiniCard({ label, item }) {
  return (
    <View style={styles.summaryMiniCard}>
      <Text style={styles.summaryMiniLabel}>{label}</Text>
      <Text style={styles.summaryMiniTitle} numberOfLines={2}>
        {item?.label || "No data yet"}
      </Text>
      <Text style={styles.summaryMiniCount}>
        {item?.count || 0} complaint{Number(item?.count || 0) === 1 ? "" : "s"}
      </Text>
    </View>
  );
}

function CategoryVerticalGraph({ data }) {
  const maxCount = Math.max(...data.map((item) => item.count), 1);

  if (!data.length) {
    return <Text style={styles.analyticsEmpty}>No category data yet.</Text>;
  }

  return (
    <View style={styles.categoryGraphRow}>
      {data.map((item) => {
        const fillHeight = Math.max(
          18,
          Math.round((item.count / maxCount) * 82),
        );

        return (
          <View key={item.label} style={styles.categoryGraphItem}>
            <Text style={styles.categoryGraphCount}>{item.count}</Text>

            <View style={styles.categoryBarTrack}>
              <View style={[styles.categoryBarFill, { height: fillHeight }]} />
            </View>

            <Text style={styles.categoryGraphLabel} numberOfLines={1}>
              {getCategoryShortLabel(item.label)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function PriorityLevelRow({ item }) {
  const style = getPriorityStyle(item.label);
  const percent = Math.max(0, Math.min(item.percent || 0, 100));

  return (
    <View style={styles.priorityRow}>
      <View style={styles.priorityLabelRow}>
        <View style={[styles.priorityDot, { backgroundColor: style.color }]} />
        <Text style={styles.priorityLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <Text style={styles.priorityPercent}>{percent}%</Text>
      </View>

      <View style={styles.priorityTrack}>
        <View
          style={[
            styles.priorityFill,
            {
              width: `${percent}%`,
              backgroundColor: style.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function ViewFullReportButton({ onPress }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={styles.viewReportRow}
      onPress={onPress}
    >
      <Text style={styles.viewReportText}>View full report</Text>
      <Feather name="chevron-right" size={22} color="rgba(8, 122, 13, 1)" />
    </TouchableOpacity>
  );
}

// ===== [ADMIN DASHBOARD] Screen component =====
export default function AdminDashboard() {
  // --- [ADMIN DASHBOARD] Navigation & unread notifications ---
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  // --- [ADMIN DASHBOARD] State (seeded from page cache) & refs ---
  const cachedDashboard = getPageCache(ADMIN_DASHBOARD_CACHE_KEY);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dashboardCounts, setDashboardCounts] = useState(
    cachedDashboard?.counts ?? {
      total: 0,
      pending: 0,
      forValidation: 0,
      completed: 0,
    },
  );
  const [categoryStats, setCategoryStats] = useState(
    cachedDashboard?.categoryStats ?? [],
  );
  const [priorityStats, setPriorityStats] = useState(
    cachedDashboard?.priorityStats ?? [],
  );
  const [departmentStats, setDepartmentStats] = useState(
    cachedDashboard?.departmentStats ?? [],
  );
  const [loadingComplaints, setLoadingComplaints] = useState(
    !cachedDashboard?.counts,
  );
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(
    getProfileAvatarUrl() || cachedDashboard?.profilePhotoUrl || null,
  );

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [ADMIN DASHBOARD] Profile avatar subscription ---
  useEffect(() => {
    return subscribeProfileAvatar((url) => {
      setProfilePhotoUrl(url);
      const prev = getPageCache(ADMIN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(ADMIN_DASHBOARD_CACHE_KEY, {
        ...prev,
        profilePhotoUrl: url,
      });
    });
  }, []);

  // --- [ADMIN DASHBOARD] Debounced navigation ---
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
    [router],
  );

  useEffect(() => {
    return () => {
      if (navigationUnlockTimerRef.current) {
        clearTimeout(navigationUnlockTimerRef.current);
      }
    };
  }, []);

  // --- [ADMIN DASHBOARD] Clock tick for greeting ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // --- [ADMIN DASHBOARD] Load dashboard counts & chart stats (cached) ---
  const loadDashboardData = useCallback(async (showLoader = true) => {
    const cached = getPageCache(ADMIN_DASHBOARD_CACHE_KEY);
    const hasCachedCounts = Boolean(cached?.counts);

    if (showLoader && shouldShowPageLoader(ADMIN_DASHBOARD_CACHE_KEY)) {
      setLoadingComplaints(true);
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        return;
      }

      const userId = session.user.id;
      const counts = await loadDashboardCardCounts();
      setDashboardCounts(counts);

      const prev = getPageCache(ADMIN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(ADMIN_DASHBOARD_CACHE_KEY, {
        ...prev,
        counts,
        currentUserId: userId,
      });
    } catch (error) {
      console.log("Admin dashboard card count error:", error);
    } finally {
      setLoadingComplaints(false);
    }

    try {
      const currentCounts =
        getPageCache(ADMIN_DASHBOARD_CACHE_KEY)?.counts || cached?.counts;

      const total = currentCounts?.total || 0;
      const [nextCategoryStats, nextPriorityStats, nextDepartmentStats] =
        await Promise.all([
          loadDashboardCategoryStats(total),
          loadDashboardPriorityStats(total),
          loadDashboardDepartmentStats(),
        ]);

      setCategoryStats(nextCategoryStats);
      setPriorityStats(nextPriorityStats);
      setDepartmentStats(nextDepartmentStats);

      const prev = getPageCache(ADMIN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(ADMIN_DASHBOARD_CACHE_KEY, {
        ...prev,
        counts: prev.counts || currentCounts,
        categoryStats: nextCategoryStats,
        priorityStats: nextPriorityStats,
        departmentStats: nextDepartmentStats,
        currentUserId: prev.currentUserId || cached?.currentUserId,
      });
    } catch (error) {
      console.log("Admin dashboard chart stats error:", error);
      if (
        !hasCachedCounts &&
        !getPageCache(ADMIN_DASHBOARD_CACHE_KEY)?.counts
      ) {
        setCategoryStats([]);
        setPriorityStats([]);
        setDepartmentStats([]);
      }
    }
  }, []);

  // --- [ADMIN DASHBOARD] On focus: restore cache, refresh, register push token ---
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const restoreAndRefresh = async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const userId = session?.user?.id;

          if (userId) {
            const cached = await ensureDashboardCacheHydrated(
              userId,
              ADMIN_DASHBOARD_CACHE_KEY,
            );
            if (cancelled) return;

            if (cached?.counts) {
              setDashboardCounts(cached.counts);
              setLoadingComplaints(false);
            }
            if (cached?.categoryStats) {
              setCategoryStats(cached.categoryStats);
            }
            if (cached?.priorityStats) {
              setPriorityStats(cached.priorityStats);
            }
            if (cached?.departmentStats) {
              setDepartmentStats(cached.departmentStats);
            }
          } else {
            const cached = getPageCache(ADMIN_DASHBOARD_CACHE_KEY);
            if (cached?.counts) {
              setDashboardCounts(cached.counts);
              setLoadingComplaints(false);
            }
          }
        } catch (error) {
          console.log("Admin dashboard cache restore error:", error);
        }

        if (!cancelled) {
          loadDashboardData(true);
          registerPushTokenForCurrentUser();
        }
      };

      restoreAndRefresh();

      return () => {
        cancelled = true;
      };
    }, [loadDashboardData]),
  );

  // --- [ADMIN DASHBOARD] Realtime: reload when complaints table changes ---
  useEffect(() => {
    const channel = supabase
      .channel(`admin-dashboard-complaints-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
        },
        () => {
          loadDashboardData(false);
        },
      )
      .subscribe((status) => {
        console.log("Admin dashboard complaints realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData]);

  // --- [ADMIN DASHBOARD] Derived values: greeting, stat cards, chart data, top department ---
  const greeting = useMemo(() => getGreetingByTime(currentDate), [currentDate]);

  const dashboardCards = useMemo(() => {
    return dashboardCardConfig.map((card) => ({
      ...card,
      value: dashboardCounts[card.key] || 0,
    }));
  }, [dashboardCounts]);

  const categoryLeadingLeast = useMemo(
    () => getLeadingAndLeast(categoryStats),
    [categoryStats],
  );

  const categoryGraphData = useMemo(
    () => getCategoryChartData(categoryStats),
    [categoryStats],
  );

  const priorityLeadingLeast = useMemo(
    () => getLeadingAndLeast(priorityStats),
    [priorityStats],
  );

  const topDepartment = departmentStats[0] || {
    label: "No department yet",
    count: 0,
    completed: 0,
    percent: 0,
  };

  // --- [ADMIN DASHBOARD] Render ---
  if (!fontsLoaded && !getPageCache(ADMIN_DASHBOARD_CACHE_KEY)?.counts) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [ADMIN DASHBOARD UI] Fixed header: logo & profile avatar */}
        <View style={styles.fixedHeader}>
          <View style={styles.logoRow}>
            <Image source={MAIN_LOGO} style={styles.mainLogoImage} />

            <Text style={styles.logoText}>
              Citi<Text style={styles.logoTextLight}>Sense</Text>
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.avatarCircle}
            onPress={() => smoothNavigate("/admin/profile")}
          >
            {profilePhotoUrl ? (
              <Image source={{ uri: profilePhotoUrl }} style={styles.avatar} />
            ) : (
              <Ionicons name="person" size={25} color="rgba(8, 122, 13, 1)" />
            )}
          </TouchableOpacity>
        </View>

        {/* [ADMIN DASHBOARD UI] Scrollable dashboard content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* [ADMIN DASHBOARD UI] Greeting */}
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>{greeting}</Text>
            <Text style={styles.greetingLarge}>Admin!</Text>
            <Text style={styles.officeText}>City Administrator</Text>
          </View>

          {/* [ADMIN DASHBOARD UI] Section title: Dashboard */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Dashboard</Text>
          </View>

          {/* [ADMIN DASHBOARD UI] Stat cards (or skeleton while loading) */}
          {loadingComplaints ? (
            <DashboardStatsSkeleton />
          ) : (
            <View style={styles.dashboardCardsRow}>
              {dashboardCards.map((item, index) => (
                <TouchableOpacity
                  key={item.title}
                  activeOpacity={0.78}
                  style={[
                    styles.dashboardCard,
                    {
                      width: CARD_WIDTH,
                      marginRight:
                        index === dashboardCards.length - 1 ? 0 : CARD_GAP,
                    },
                  ]}
                  onPress={() =>
                    smoothNavigate({
                      pathname: "/admin/complaints",
                      params: { filter: item.filter },
                    })
                  }
                >
                  <View style={styles.cardIconCircle}>
                    <MaterialCommunityIcons
                      name={item.icon}
                      size={23}
                      color="rgba(255, 255, 255, 1)"
                    />
                  </View>

                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardValue}>{item.value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* [ADMIN DASHBOARD UI] Manage Users shortcut card */}
          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.manageUsersCard}
            onPress={() => smoothNavigate("/admin/manageUsers")}
          >
            <View style={styles.manageUsersIconCircle}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={27}
                color="rgba(8, 122, 13, 1)"
              />
            </View>

            <View style={styles.manageUsersTextBox}>
              <Text style={styles.manageUsersTitle}>Manage Users</Text>
              <Text style={styles.manageUsersSubtitle}>
                View, deactivate, or delete user accounts
              </Text>
            </View>

            <Feather name="chevron-right" size={22} color="rgba(111, 119, 111, 1)" />
          </TouchableOpacity>

          {/* [ADMIN DASHBOARD UI] Categories card: leading/least & bar graph */}
          <View style={styles.categoriesCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryTitle}>Categories</Text>
              <View style={styles.summaryIconCircle}>
                <MaterialCommunityIcons
                  name="chart-bar"
                  size={27}
                  color="rgba(8, 122, 13, 1)"
                />
              </View>
            </View>

            <View style={styles.summaryMiniRow}>
              <SummaryMiniCard
                label="Leading"
                item={categoryLeadingLeast.leading}
              />
              <SummaryMiniCard
                label="Least"
                item={categoryLeadingLeast.least}
              />
            </View>

            <CategoryVerticalGraph data={categoryGraphData} />

            <ViewFullReportButton
              onPress={() => smoothNavigate("/admin/analytics")}
            />
          </View>

          {/* [ADMIN DASHBOARD UI] Bottom analytics row */}
          <View style={styles.bottomAnalyticsRow}>
            {/* [ADMIN DASHBOARD UI] Top-performing department card */}
            <View style={styles.smallAnalyticsCard}>
              <Text style={styles.smallCardTitle}>
                Top-Performing Departments
              </Text>

              <View style={styles.trophyCircle}>
                <MaterialCommunityIcons
                  name="trophy-outline"
                  size={30}
                  color="rgba(8, 122, 13, 1)"
                />
              </View>

              <Text style={styles.departmentName} numberOfLines={2}>
                {topDepartment.label}
              </Text>

              <Text style={styles.departmentRate}>
                {topDepartment.percent}% rate
              </Text>

              <View style={styles.departmentProgressTrack}>
                <View
                  style={[
                    styles.departmentProgressFill,
                    {
                      width: `${Math.max(0, Math.min(topDepartment.percent, 100))}%`,
                    },
                  ]}
                />
              </View>

              <View style={styles.smallCardSpacer} />

              <ViewFullReportButton
                onPress={() => smoothNavigate("/admin/analytics")}
              />
            </View>

            {/* [ADMIN DASHBOARD UI] Priority levels card */}
            <View style={styles.smallAnalyticsCard}>
              <Text style={styles.smallCardTitle}>Priority Levels</Text>

              <Text style={styles.priorityMainTitle} numberOfLines={1}>
                {priorityLeadingLeast.leading.label}
              </Text>

              <Text style={styles.priorityMainSubtitle}>
                Highest count • {priorityLeadingLeast.leading.count} complaint
                {Number(priorityLeadingLeast.leading.count) === 1 ? "" : "s"}
              </Text>

              <View style={styles.priorityListBox}>
                {priorityStats.length === 0 ? (
                  <Text style={styles.analyticsEmpty}>
                    No priority data yet.
                  </Text>
                ) : (
                  priorityStats
                    .slice(0, 4)
                    .map((item) => (
                      <PriorityLevelRow key={item.label} item={item} />
                    ))
                )}
              </View>

              {priorityStats.length > 0 && (
                <Text style={styles.priorityLeastText} numberOfLines={1}>
                  Least: {priorityLeadingLeast.least.label} •{" "}
                  {priorityLeadingLeast.least.count}
                </Text>
              )}

              <ViewFullReportButton
                onPress={() => smoothNavigate("/admin/analytics")}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ===== [ADMIN DASHBOARD] Styles =====
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

  loader: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  fixedHeader: {
    height: 46,
    paddingHorizontal: H_PADDING,
    marginTop: 0,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    zIndex: 20,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  mainLogoImage: {
    width: 42,
    height: 42,
    resizeMode: "contain",
    marginRight: 6,
  },

  logoText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 25,
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.1,
  },

  logoTextLight: {
    color: "rgba(109, 187, 63, 1)",
  },

  avatarCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  avatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  // --- Greeting & section title ---
  greetingContainer: {
    marginBottom: 16,
  },

  greetingSmall: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.4,
  },

  greetingLarge: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: "rgba(8, 122, 13, 1)",
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  officeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 4,
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
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Stat cards ---
  dashboardCardsRow: {
    flexDirection: "row",
    marginBottom: 19,
  },

  dashboardCard: {
    height: 138,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    paddingTop: 12,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.2,
    color: "rgba(8, 122, 13, 1)",
    textAlign: "center",
    lineHeight: 14,
    height: 34,
    paddingHorizontal: 2,
  },

  cardValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 31,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 0,
    lineHeight: 36,
  },

  // --- Manage Users card ---
  manageUsersCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  manageUsersIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  manageUsersTextBox: {
    flex: 1,
    paddingRight: 8,
  },

  manageUsersTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
  },

  manageUsersSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 2,
  },

  // --- Categories card & graph ---
  categoriesCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 14,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.045,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  summaryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 13,
  },

  summaryTitle: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "rgba(23, 23, 23, 1)",
    paddingRight: 10,
  },

  summaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(234, 246, 228, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  summaryMiniRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },

  summaryMiniCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 13,
    backgroundColor: "rgba(251, 254, 250, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
  },

  summaryMiniLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 3,
  },

  summaryMiniTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    lineHeight: 17,
    color: "rgba(23, 23, 23, 1)",
  },

  summaryMiniCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 2,
  },

  categoryGraphRow: {
    minHeight: 134,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 12,
  },

  categoryGraphItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 0,
  },

  categoryGraphCount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 4,
  },

  categoryBarTrack: {
    width: 25,
    height: 86,
    borderRadius: 14,
    backgroundColor: "rgba(238, 245, 236, 1)",
    overflow: "hidden",
    justifyContent: "flex-end",
  },

  categoryBarFill: {
    width: "100%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  categoryGraphLabel: {
    width: "100%",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 8.7,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 7,
    textAlign: "center",
  },

  viewReportRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },

  viewReportText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Bottom analytics cards (departments, priority) ---
  bottomAnalyticsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },

  smallAnalyticsCard: {
    flex: 1,
    minHeight: 255,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 12,
    paddingVertical: 14,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  smallCardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    lineHeight: 19,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 14,
  },

  trophyCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(234, 246, 228, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },

  departmentName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.3,
    lineHeight: 17,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 6,
  },

  departmentRate: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 12,
  },

  departmentProgressTrack: {
    height: 9,
    borderRadius: 9,
    backgroundColor: "rgba(237, 241, 236, 1)",
    overflow: "hidden",
  },

  departmentProgressFill: {
    height: "100%",
    minWidth: 4,
    borderRadius: 9,
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  smallCardSpacer: {
    flex: 1,
  },

  priorityMainTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 1,
  },

  priorityMainSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 0,
    marginBottom: 9,
  },

  priorityListBox: {
    minHeight: 103,
    marginBottom: 5,
  },

  priorityRow: {
    marginBottom: 8,
  },

  priorityLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },

  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },

  priorityLabel: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(23, 23, 23, 1)",
    paddingRight: 4,
  },

  priorityPercent: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
  },

  priorityTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: "rgba(237, 241, 236, 1)",
    overflow: "hidden",
  },

  priorityFill: {
    height: "100%",
    minWidth: 4,
    borderRadius: 6,
  },

  priorityLeastText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 9.8,
    color: "rgba(111, 119, 111, 1)",
    marginBottom: 5,
  },

  analyticsEmpty: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    paddingVertical: 8,
  },

  // --- Bottom navigation ---
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
});

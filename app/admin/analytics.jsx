import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
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
const ORANGE = "#F4A24C";
const GRAY = "#8A938A";

const H_PADDING = 20;

const ALL_PRIORITY_LEVELS = ["Critical", "Urgent", "High", "Normal", "Low"];

const PRIORITY_COLOR_MAP = {
  Critical: RED,
  Urgent: RED,
  High: ORANGE,
  Normal: GREEN,
  Low: BLUE,
};

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

function cleanDisplayText(value, fallback = "Unspecified") {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean || fallback;
}

function normalizeStatus(value) {
  const clean = normalizeText(value);

  if (clean === "pending") return "Pending";
  if (clean === "assigned") return "Assigned";
  if (clean === "in_progress" || clean === "in progress") return "In Progress";
  if (clean === "for_validation" || clean === "for validation" || clean === "validation") {
    return "For Validation";
  }
  if (clean === "validated") return "Validated";
  if (clean === "completed" || clean === "resolved") return "Completed";
  if (
    clean === "returned" ||
    clean === "returned to department" ||
    clean === "returned to department head" ||
    clean === "for rework" ||
    clean === "needs revision"
  ) {
    return "Returned";
  }
  if (clean === "unsolved" || clean === "unresolved" || clean === "not solved") {
    return "Unsolved";
  }

  return cleanDisplayText(value, "Pending");
}

function normalizePriority(value, isEmergency = false) {
  const clean = normalizeText(value);

  if (clean === "critical") return "Critical";
  if (clean === "urgent") return "Urgent";
  if (clean === "high") return "High";
  if (clean === "low") return "Low";
  if (clean === "normal" || clean === "medium") return "Normal";

  return isEmergency ? "Critical" : "Normal";
}

function getCategoryLabel(category) {
  const clean = cleanDisplayText(category, "Unclassified");

  return clean
    .replace(/ Concerns$/i, "")
    .replace(/ and /gi, " & ")
    .replace(/Road & Infrastructure/i, "Road")
    .replace(/Drainage & Flooding/i, "Drainage")
    .replace(/Waste & Environmental/i, "Waste")
    .replace(/Traffic & Road Safety/i, "Traffic")
    .replace(/Health & Sanitation/i, "Health")
    .replace(/Disaster & Emergency/i, "Disaster")
    .replace(/Coastal & Marine Protection/i, "Coastal")
    .replace(/Tourism Site \/ Public Attraction/i, "Tourism")
    .replace(/Planning & Zoning/i, "Planning");
}

function getMostAndLeast(data, valueKey = "count") {
  if (!data.length) {
    return {
      leading: null,
      least: null,
    };
  }

  const leading = data.reduce((highest, item) =>
    item[valueKey] > highest[valueKey] ? item : highest
  );

  const least = data.reduce((lowest, item) =>
    item[valueKey] < lowest[valueKey] ? item : lowest
  );

  return { leading, least };
}

function mapComplaint(row) {
  return {
    id: row.id,
    shortId: row.short_id || String(row.id || "").slice(0, 8),
    title: row.title || "Untitled Complaint",
    category: cleanDisplayText(row.category || row.concern_category, "Unclassified"),
    assignedOffice: cleanDisplayText(
      row.assigned_office || row.assignedOffice || row.department,
      "Unassigned"
    ),
    priority: normalizePriority(row.priority, row.is_emergency),
    status: normalizeStatus(row.status),
    createdAt: row.created_at || row.submitted_at || new Date().toISOString(),
  };
}

function buildCategoryData(complaints) {
  const grouped = complaints.reduce((acc, complaint) => {
    const key = complaint.category || "Unclassified";

    if (!acc[key]) {
      acc[key] = {
        label: getCategoryLabel(key),
        fullName: key,
        count: 0,
      };
    }

    acc[key].count += 1;
    return acc;
  }, {});

  return Object.values(grouped).sort((a, b) => b.count - a.count);
}

function buildPriorityData(complaints) {
  const grouped = complaints.reduce((acc, complaint) => {
    const priority = complaint.priority || "Normal";
    acc[priority] = (acc[priority] || 0) + 1;
    return acc;
  }, {});

  const listed = ALL_PRIORITY_LEVELS.map((priority) => ({
    label: priority,
    value: grouped[priority] || 0,
    color: PRIORITY_COLOR_MAP[priority] || GREEN,
  }));

  const extras = Object.keys(grouped)
    .filter((priority) => !ALL_PRIORITY_LEVELS.includes(priority))
    .map((priority) => ({
      label: priority,
      value: grouped[priority],
      color: GRAY,
    }));

  return [...listed, ...extras].filter((item) => item.value > 0);
}

function buildDepartmentData(complaints) {
  const grouped = complaints.reduce((acc, complaint) => {
    const department = complaint.assignedOffice || "Unassigned";

    if (!acc[department]) {
      acc[department] = {
        name: department,
        handled: 0,
        completed: 0,
        returned: 0,
        forValidation: 0,
        rate: 0,
      };
    }

    acc[department].handled += 1;

    if (complaint.status === "Completed") {
      acc[department].completed += 1;
    }

    if (complaint.status === "Returned" || complaint.status === "Unsolved") {
      acc[department].returned += 1;
    }

    if (complaint.status === "For Validation" || complaint.status === "Validated") {
      acc[department].forValidation += 1;
    }

    return acc;
  }, {});

  return Object.values(grouped)
    .map((department) => ({
      ...department,
      rate:
        department.handled > 0
          ? Math.round((department.completed / department.handled) * 100)
          : 0,
    }))
    .sort((a, b) => {
      if (b.rate !== a.rate) return b.rate - a.rate;
      if (b.completed !== a.completed) return b.completed - a.completed;
      return b.handled - a.handled;
    });
}

function buildStatusData(complaints) {
  const grouped = complaints.reduce((acc, complaint) => {
    acc[complaint.status] = (acc[complaint.status] || 0) + 1;
    return acc;
  }, {});

  return Object.keys(grouped)
    .map((status) => ({
      label: status,
      value: grouped[status],
    }))
    .sort((a, b) => b.value - a.value);
}

export default function AdminAnalytics() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

  const [complaints, setComplaints] = useState([]);
  const [loadingReport, setLoadingReport] = useState(true);

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

  const loadAnalyticsReport = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoadingReport(true);
      }

      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Admin analytics load error:", error);
        setComplaints([]);
        return;
      }

      setComplaints((data || []).map(mapComplaint));
    } catch (error) {
      console.log("Admin analytics load catch error:", error);
      setComplaints([]);
    } finally {
      if (showLoader) {
        setLoadingReport(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAnalyticsReport(true);
    }, [loadAnalyticsReport])
  );

  useEffect(() => {
    const channel = supabase
      .channel(`admin-analytics-complaints-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
        },
        () => {
          loadAnalyticsReport(false);
        }
      )
      .subscribe((status) => {
        console.log("Admin analytics realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAnalyticsReport]);

  const categoryData = useMemo(() => buildCategoryData(complaints), [complaints]);
  const priorityData = useMemo(() => buildPriorityData(complaints), [complaints]);
  const departmentData = useMemo(() => buildDepartmentData(complaints), [complaints]);
  const statusData = useMemo(() => buildStatusData(complaints), [complaints]);

  const maxCategoryCount = useMemo(() => {
    if (!categoryData.length) return 1;
    return Math.max(...categoryData.map((item) => item.count), 1);
  }, [categoryData]);

  const totalPriority = useMemo(() => {
    return priorityData.reduce((sum, item) => sum + item.value, 0) || 1;
  }, [priorityData]);

  const { leading: leadingCategory, least: leastCategory } = useMemo(
    () => getMostAndLeast(categoryData, "count"),
    [categoryData]
  );

  const { leading: leadingPriority, least: leastPriority } = useMemo(
    () => getMostAndLeast(priorityData, "value"),
    [priorityData]
  );

  const bestDepartment = useMemo(() => {
    return departmentData[0] || null;
  }, [departmentData]);

  const leastDepartment = useMemo(() => {
    if (!departmentData.length) return null;

    return departmentData.reduce((lowest, item) => {
      if (item.rate < lowest.rate) return item;
      if (item.rate === lowest.rate && item.handled < lowest.handled) return item;
      return lowest;
    });
  }, [departmentData]);

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
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>Full Report</Text>
            <Text style={styles.headerSubtitle}>
              Real-time analytics from all citizen-submitted complaints across all departments.
            </Text>
          </View>

          {loadingReport ? (
            <View style={styles.loadingReportCard}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>Loading full report...</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Categories</Text>
              </View>

              <View style={styles.largeReportCard}>
                <View style={styles.cardTopRow}>
                  <View>
                    <Text style={styles.reportTitle}>Category Distribution</Text>
                    <Text style={styles.reportSubtitle}>
                      Leading and least reported categories
                    </Text>
                  </View>

                  <View style={styles.reportIconCircle}>
                    <MaterialCommunityIcons
                      name="chart-bar"
                      size={22}
                      color={GREEN}
                    />
                  </View>
                </View>

                <View style={styles.insightRow}>
                  <View style={styles.insightBox}>
                    <Text style={styles.insightLabel}>Leading</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {leadingCategory?.fullName || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {leadingCategory ? `${leadingCategory.count} complaints` : "0 complaints"}
                    </Text>
                  </View>

                  <View style={styles.insightBox}>
                    <Text style={styles.insightLabel}>Least</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {leastCategory?.fullName || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {leastCategory ? `${leastCategory.count} complaints` : "0 complaints"}
                    </Text>
                  </View>
                </View>

                {categoryData.length === 0 ? (
                  <View style={styles.emptyChartBox}>
                    <Ionicons name="bar-chart-outline" size={34} color={MUTED} />
                    <Text style={styles.emptyChartText}>No category data yet</Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryChartScroll}
                  >
                    <View style={styles.categoryChart}>
                      {categoryData.map((item) => {
                        const barHeight = Math.max(
                          14,
                          Math.round((item.count / maxCategoryCount) * 88)
                        );

                        return (
                          <View key={item.fullName} style={styles.categoryChartItem}>
                            <Text style={styles.chartCount}>{item.count}</Text>

                            <View style={styles.chartBarTrack}>
                              <View
                                style={[styles.chartBarFill, { height: barHeight }]}
                              />
                            </View>

                            <Text style={styles.chartLabel} numberOfLines={1}>
                              {item.label}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>

              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Priority Levels</Text>
              </View>

              <View style={styles.priorityCard}>
                <View style={styles.insightRowCompact}>
                  <View style={styles.insightBoxCompact}>
                    <Text style={styles.insightLabel}>Leading</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {leadingPriority?.label || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {leadingPriority ? `${leadingPriority.value} complaints` : "0 complaints"}
                    </Text>
                  </View>

                  <View style={styles.insightBoxCompact}>
                    <Text style={styles.insightLabel}>Least</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {leastPriority?.label || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {leastPriority ? `${leastPriority.value} complaints` : "0 complaints"}
                    </Text>
                  </View>
                </View>

                {priorityData.length === 0 ? (
                  <View style={styles.emptyMiniBox}>
                    <Text style={styles.emptyChartText}>No priority data yet</Text>
                  </View>
                ) : (
                  priorityData.map((item) => {
                    const percent = Math.round((item.value / totalPriority) * 100);

                    return (
                      <View key={item.label} style={styles.priorityItem}>
                        <View style={styles.priorityTopRow}>
                          <View style={styles.priorityLabelRow}>
                            <View
                              style={[
                                styles.priorityDot,
                                { backgroundColor: item.color },
                              ]}
                            />

                            <Text style={styles.priorityLabel}>{item.label}</Text>
                          </View>

                          <Text style={styles.priorityValue}>
                            {item.value} • {percent}%
                          </Text>
                        </View>

                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${percent}%`,
                                backgroundColor: item.color,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Top-Performing Departments</Text>
              </View>

              <View style={styles.departmentCard}>
                <View style={styles.insightRowCompact}>
                  <View style={styles.insightBoxCompact}>
                    <Text style={styles.insightLabel}>Leading</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {bestDepartment?.name || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {bestDepartment
                        ? `${bestDepartment.rate}% • ${bestDepartment.completed}/${bestDepartment.handled}`
                        : "0% performance"}
                    </Text>
                  </View>

                  <View style={styles.insightBoxCompact}>
                    <Text style={styles.insightLabel}>Least</Text>
                    <Text style={styles.insightValue} numberOfLines={1}>
                      {leastDepartment?.name || "No data"}
                    </Text>
                    <Text style={styles.insightCount}>
                      {leastDepartment
                        ? `${leastDepartment.rate}% • ${leastDepartment.completed}/${leastDepartment.handled}`
                        : "0% performance"}
                    </Text>
                  </View>
                </View>

                {bestDepartment && (
                  <View style={styles.bestDepartmentBox}>
                    <View style={styles.bestDepartmentIcon}>
                      <MaterialCommunityIcons
                        name="trophy-outline"
                        size={25}
                        color={GREEN}
                      />
                    </View>

                    <View style={styles.bestDepartmentTextBox}>
                      <Text style={styles.bestDepartmentLabel}>Top Department</Text>
                      <Text style={styles.bestDepartmentName} numberOfLines={1}>
                        {bestDepartment.name}
                      </Text>
                      <Text style={styles.bestDepartmentSub}>
                        {bestDepartment.rate}% completion rate
                      </Text>
                    </View>
                  </View>
                )}

                {departmentData.length === 0 ? (
                  <View style={styles.emptyMiniBox}>
                    <Text style={styles.emptyChartText}>No department data yet</Text>
                  </View>
                ) : (
                  departmentData.map((item, index) => (
                    <View key={item.name} style={styles.departmentRow}>
                      <View style={styles.departmentRankCircle}>
                        <Text style={styles.departmentRankText}>{index + 1}</Text>
                      </View>

                      <View style={styles.departmentInfo}>
                        <View style={styles.departmentTopRow}>
                          <Text style={styles.departmentName} numberOfLines={1}>
                            {item.name}
                          </Text>

                          <Text style={styles.departmentRate}>{item.rate}%</Text>
                        </View>

                        <Text style={styles.departmentSubText}>
                          {item.completed} completed of {item.handled} handled
                        </Text>

                        <View style={styles.departmentProgressTrack}>
                          <View
                            style={[
                              styles.departmentProgressFill,
                              { width: `${item.rate}%` },
                            ]}
                          />
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
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
      </View>
    </SafeAreaView>
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

  headerContainer: {
    marginBottom: 13,
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 17,
    marginTop: 2,
  },

  loadingReportCard: {
    minHeight: 230,
    borderRadius: 16,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
    marginTop: 10,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: GREEN,
  },

  largeReportCard: {
    minHeight: 260,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 15,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  reportTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: TEXT,
  },

  reportSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },

  reportIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  insightRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },

  insightRowCompact: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  insightBox: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  insightBoxCompact: {
    flex: 1,
    minHeight: 58,
    borderRadius: 12,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  insightLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.5,
    color: GREEN,
  },

  insightValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: TEXT,
    marginTop: 2,
  },

  insightCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 9.5,
    color: MUTED,
    marginTop: 1,
  },

  categoryChartScroll: {
    paddingRight: 10,
  },

  categoryChart: {
    height: 122,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 11,
    paddingHorizontal: 2,
    marginTop: 12,
  },

  categoryChartItem: {
    alignItems: "center",
    justifyContent: "flex-end",
    width: 48,
  },

  chartCount: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.8,
    color: GREEN,
    marginBottom: 3,
  },

  chartBarTrack: {
    width: 24,
    height: 88,
    borderRadius: 12,
    backgroundColor: "#EAF1E7",
    justifyContent: "flex-end",
    overflow: "hidden",
  },

  chartBarFill: {
    width: "100%",
    borderRadius: 12,
    backgroundColor: GREEN,
  },

  chartLabel: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 7.8,
    color: MUTED,
    marginTop: 5,
    maxWidth: 48,
  },

  emptyChartBox: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyMiniBox: {
    minHeight: 85,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyChartText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    marginTop: 5,
  },

  priorityCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 15,
    gap: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  priorityItem: {
    gap: 6,
  },

  priorityTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  priorityLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 7,
  },

  priorityLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: TEXT,
  },

  priorityValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  progressTrack: {
    height: 8,
    borderRadius: 6,
    backgroundColor: "#EAF1E7",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 6,
  },

  departmentCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 15,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  bestDepartmentBox: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  bestDepartmentIcon: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },

  bestDepartmentTextBox: {
    flex: 1,
  },

  bestDepartmentLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  bestDepartmentName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: TEXT,
    marginTop: 1,
  },

  bestDepartmentSub: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },

  departmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  departmentRankCircle: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  departmentRankText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10,
    color: GREEN,
  },

  departmentInfo: {
    flex: 1,
  },

  departmentTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  departmentName: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 11.3,
    color: TEXT,
    paddingRight: 8,
  },

  departmentRate: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  departmentSubText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 9.7,
    color: MUTED,
    marginTop: 1,
    marginBottom: 5,
  },

  departmentProgressTrack: {
    height: 6,
    borderRadius: 5,
    backgroundColor: "#EAF1E7",
    overflow: "hidden",
  },

  departmentProgressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: GREEN,
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
});

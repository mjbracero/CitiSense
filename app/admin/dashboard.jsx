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
  ActivityIndicator,
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
import { supabase } from "../../lib/supabase";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const ACCENT_GREEN = "#6DBB3F";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const BLUE = "#315A9A";
const ORANGE = "#F4A24C";
const GRAY = "#8A8F8A";
const TRACK = "#EDF1EC";

const H_PADDING = 20;
const CARD_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP * 3) / 4;

const dashboardCardConfig = [
  {
    title: "Total Complaints",
    key: "total",
    icon: "clipboard-text-outline",
  },
  {
    title: "Pending Complaints",
    key: "pending",
    icon: "clock-outline",
  },
  {
    title: "For Validation",
    key: "forValidation",
    icon: "account-check-outline",
  },
  {
    title: "Completed",
    key: "completed",
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(status) {
  const clean = normalizeText(status);

  if (!clean) return "Pending";
  if (clean === "pending" || clean === "submitted") return "Pending";
  if (clean === "assigned") return "Assigned";
  if (clean === "in_progress" || clean === "in progress") return "In Progress";

  if (
    clean === "for_validation" ||
    clean === "for validation" ||
    clean === "validation"
  ) {
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

  if (
    clean === "unsolved" ||
    clean === "unresolved" ||
    clean === "not solved" ||
    clean === "citizen returned" ||
    clean === "returned by citizen"
  ) {
    return "Unsolved";
  }

  return String(status || "Pending").trim();
}

function normalizePriority(priority, isEmergency = false) {
  const clean = normalizeText(priority);

  if (clean === "critical") return "Critical";
  if (clean === "urgent") return "Urgent";
  if (clean === "high") return "High";
  if (clean === "low") return "Low";
  if (clean === "normal" || clean === "medium") return "Normal";

  return isEmergency ? "Critical" : "Normal";
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

  if (normalizedPriority === "Critical") return { bg: "#FFF0F0", color: RED };
  if (normalizedPriority === "Urgent") return { bg: "#FFF0F0", color: RED };
  if (normalizedPriority === "High") return { bg: "#FFF2E8", color: ORANGE };
  if (normalizedPriority === "Normal") return { bg: LIGHT_GREEN, color: GREEN };
  if (normalizedPriority === "Low") return { bg: "#F1F4F1", color: BLUE };

  return { bg: LIGHT_GREEN, color: GREEN };
}

function formatDbDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDbTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getCountMap(items, keyGetter) {
  return items.reduce((acc, item) => {
    const key = keyGetter(item) || "Unspecified";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getRankedStatsFromMap(countMap, total) {
  return Object.entries(countMap)
    .map(([label, count]) => ({
      label,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function getLeadingAndLeast(stats) {
  if (!stats.length) {
    return {
      leading: { label: "No data yet", count: 0, percent: 0 },
      least: { label: "No data yet", count: 0, percent: 0 },
    };
  }

  const sortedDesc = [...stats].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );

  const sortedAsc = [...stats].sort(
    (a, b) => a.count - b.count || a.label.localeCompare(b.label)
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
    .replace(/Electricity/gi, "Electric")
    .replace(/Health and Sanitation/gi, "Health")
    .replace(/Disaster and Emergency/gi, "Disaster")
    .replace(/Peace and Order/gi, "Peace")
    .replace(/Tourism Site \/ Public Attraction/gi, "Tourism")
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
    (a, b) => a.count - b.count || a.label.localeCompare(b.label)
  )[0];

  const merged = [...topFive];

  if (least && !merged.some((item) => item.label === least.label)) {
    merged.push(least);
  }

  return merged.slice(0, 6);
}

async function loadCitizenProfiles(citizenIds = []) {
  if (!citizenIds.length) return {};

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, contact_number, avatar_url")
      .in("id", citizenIds);

    if (error) {
      console.log("Admin dashboard citizen profiles load error:", error);
      return {};
    }

    return (data || []).reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {});
  } catch (error) {
    console.log("Admin dashboard citizen profiles catch error:", error);
    return {};
  }
}

function mapComplaintRow(row, profileMap = {}) {
  const createdAt =
    row.created_at || row.submitted_at || row.submitted_date_time || new Date().toISOString();

  const profile = profileMap[row.citizen_id] || {};
  const status = normalizeStatus(row.status);
  const priority = normalizePriority(row.priority, row.is_emergency);

  return {
    id: row.short_id || row.id,
    rawId: row.id,
    title: row.title || "Untitled Complaint",
    category: row.category || row.concern_category || "Unclassified",
    department: row.assigned_office || row.assignedOffice || row.department || "Unassigned",
    location: row.location || row.barangay || row.location_text || "Location not available",
    geotaggedLocation:
      row.location_text ||
      row.geotagged_location ||
      row.location ||
      "Pinned location not available",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    createdAt,
    status,
    priority,
    citizen:
      row.citizen_name ||
      row.full_name ||
      profile.full_name ||
      profile.email ||
      "Citizen",
    contact:
      row.contact_number ||
      profile.contact_number ||
      profile.phone_number ||
      profile.phone ||
      "No contact number",
    description: row.description || "No description provided.",
    validationStatus: row.validation_status || null,
    isEmergency: Boolean(row.is_emergency),
  };
}

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
        const fillHeight = Math.max(18, Math.round((item.count / maxCount) * 82));

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
      <Feather name="chevron-right" size={22} color={GREEN} />
    </TouchableOpacity>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [complaintsData, setComplaintsData] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);

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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const loadAllComplaints = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setLoadingComplaints(true);
      }

      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Admin dashboard complaints load error:", error);
        setComplaintsData([]);
        return;
      }

      const citizenIds = Array.from(
        new Set((data || []).map((row) => row.citizen_id).filter(Boolean))
      );

      const profileMap = await loadCitizenProfiles(citizenIds);

      const mappedComplaints = (data || []).map((row) =>
        mapComplaintRow(row, profileMap)
      );

      setComplaintsData(mappedComplaints);
    } catch (error) {
      console.log("Admin dashboard complaints catch error:", error);
      setComplaintsData([]);
    } finally {
      if (showLoader) {
        setLoadingComplaints(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAllComplaints(true);
    }, [loadAllComplaints])
  );

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
          loadAllComplaints(false);
        }
      )
      .subscribe((status) => {
        console.log("Admin dashboard complaints realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllComplaints]);

  const greeting = useMemo(() => getGreetingByTime(currentDate), [currentDate]);

  const dashboardCounts = useMemo(() => {
    const total = complaintsData.length;

    const pending = complaintsData.filter((item) =>
      ["Pending", "Assigned"].includes(item.status)
    ).length;

    const forValidation = complaintsData.filter(
      (item) => item.status === "For Validation" || item.status === "Validated"
    ).length;

    const completed = complaintsData.filter(
      (item) => item.status === "Completed"
    ).length;

    return {
      total,
      pending,
      forValidation,
      completed,
    };
  }, [complaintsData]);

  const dashboardCards = useMemo(() => {
    return dashboardCardConfig.map((card) => ({
      ...card,
      value: dashboardCounts[card.key] || 0,
    }));
  }, [dashboardCounts]);

  const categoryStats = useMemo(() => {
    const countMap = getCountMap(complaintsData, (item) => item.category);
    return getRankedStatsFromMap(countMap, complaintsData.length);
  }, [complaintsData]);

  const categoryLeadingLeast = useMemo(
    () => getLeadingAndLeast(categoryStats),
    [categoryStats]
  );

  const categoryGraphData = useMemo(
    () => getCategoryChartData(categoryStats),
    [categoryStats]
  );

  const priorityStats = useMemo(() => {
    const countMap = getCountMap(complaintsData, (item) => item.priority);
    const total = complaintsData.length;

    const orderedStats = priorityOrder
      .map((priority) => ({
        label: priority,
        count: countMap[priority] || 0,
        percent: total > 0 ? Math.round(((countMap[priority] || 0) / total) * 100) : 0,
      }))
      .filter((item) => item.count > 0);

    const otherStats = Object.keys(countMap)
      .filter((priority) => !priorityOrder.includes(priority))
      .map((priority) => ({
        label: priority,
        count: countMap[priority] || 0,
        percent: total > 0 ? Math.round(((countMap[priority] || 0) / total) * 100) : 0,
      }));

    return [...orderedStats, ...otherStats];
  }, [complaintsData]);

  const priorityLeadingLeast = useMemo(
    () => getLeadingAndLeast(priorityStats),
    [priorityStats]
  );

  const departmentStats = useMemo(() => {
    const map = complaintsData.reduce((acc, item) => {
      const department = item.department || "Unassigned";

      if (!acc[department]) {
        acc[department] = {
          label: department,
          count: 0,
          completed: 0,
          percent: 0,
        };
      }

      acc[department].count += 1;

      if (item.status === "Completed") {
        acc[department].completed += 1;
      }

      return acc;
    }, {});

    return Object.values(map)
      .map((item) => ({
        ...item,
        percent: item.count > 0 ? Math.round((item.completed / item.count) * 100) : 0,
      }))
      .sort(
        (a, b) =>
          b.percent - a.percent || b.completed - a.completed || b.count - a.count
      );
  }, [complaintsData]);

  const topDepartment = departmentStats[0] || {
    label: "No department yet",
    count: 0,
    completed: 0,
    percent: 0,
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
            <Ionicons name="person" size={25} color={GREEN} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>{greeting}</Text>
            <Text style={styles.greetingLarge}>Admin!</Text>
            <Text style={styles.officeText}>City Administrator</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Dashboard</Text>
            {loadingComplaints && <ActivityIndicator size="small" color={GREEN} />}
          </View>

          <View style={styles.dashboardCardsRow}>
            {dashboardCards.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.dashboardCard,
                  {
                    width: CARD_WIDTH,
                    marginRight: index === dashboardCards.length - 1 ? 0 : CARD_GAP,
                  },
                ]}
              >
                <View style={styles.cardIconCircle}>
                  <MaterialCommunityIcons name={item.icon} size={23} color={WHITE} />
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            activeOpacity={0.78}
            style={styles.manageUsersCard}
            onPress={() => smoothNavigate("/admin/manageUsers")}
          >
            <View style={styles.manageUsersIconCircle}>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={27}
                color={GREEN}
              />
            </View>

            <View style={styles.manageUsersTextBox}>
              <Text style={styles.manageUsersTitle}>Manage Users</Text>
              <Text style={styles.manageUsersSubtitle}>
                View, deactivate, or delete user accounts
              </Text>
            </View>

            <Feather name="chevron-right" size={22} color={MUTED} />
          </TouchableOpacity>

          <View style={styles.categoriesCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryTitle}>Categories</Text>
              <View style={styles.summaryIconCircle}>
                <MaterialCommunityIcons name="chart-bar" size={27} color={GREEN} />
              </View>
            </View>

            <View style={styles.summaryMiniRow}>
              <SummaryMiniCard label="Leading" item={categoryLeadingLeast.leading} />
              <SummaryMiniCard label="Least" item={categoryLeadingLeast.least} />
            </View>

            <CategoryVerticalGraph data={categoryGraphData} />

            <ViewFullReportButton onPress={() => smoothNavigate("/admin/analytics")} />
          </View>

          <View style={styles.bottomAnalyticsRow}>
            <View style={styles.smallAnalyticsCard}>
              <Text style={styles.smallCardTitle}>Top-Performing Departments</Text>

              <View style={styles.trophyCircle}>
                <MaterialCommunityIcons name="trophy-outline" size={30} color={GREEN} />
              </View>

              <Text style={styles.departmentName} numberOfLines={2}>
                {topDepartment.label}
              </Text>

              <Text style={styles.departmentRate}>{topDepartment.percent}% rate</Text>

              <View style={styles.departmentProgressTrack}>
                <View
                  style={[
                    styles.departmentProgressFill,
                    { width: `${Math.max(0, Math.min(topDepartment.percent, 100))}%` },
                  ]}
                />
              </View>

              <View style={styles.smallCardSpacer} />

              <ViewFullReportButton onPress={() => smoothNavigate("/admin/analytics")} />
            </View>

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
                  <Text style={styles.analyticsEmpty}>No priority data yet.</Text>
                ) : (
                  priorityStats.slice(0, 4).map((item) => (
                    <PriorityLevelRow key={item.label} item={item} />
                  ))
                )}
              </View>

              {priorityStats.length > 0 && (
                <Text style={styles.priorityLeastText} numberOfLines={1}>
                  Least: {priorityLeadingLeast.least.label} • {priorityLeadingLeast.least.count}
                </Text>
              )}

              <ViewFullReportButton onPress={() => smoothNavigate("/admin/analytics")} />
            </View>
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
    color: GREEN,
    letterSpacing: 0.1,
  },

  logoTextLight: {
    color: ACCENT_GREEN,
  },

  avatarCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#D9EFD1",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    paddingBottom: 116,
  },

  greetingContainer: {
    marginBottom: 16,
  },

  greetingSmall: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: GREEN,
    letterSpacing: 0.4,
  },

  greetingLarge: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  officeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: MUTED,
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
    color: GREEN,
  },

  dashboardCardsRow: {
    flexDirection: "row",
    marginBottom: 19,
  },

  dashboardCard: {
    height: 138,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    paddingTop: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.2,
    color: GREEN,
    textAlign: "center",
    lineHeight: 14,
    height: 34,
    paddingHorizontal: 2,
  },

  cardValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 31,
    color: GREEN,
    marginTop: 0,
    lineHeight: 36,
  },

  manageUsersCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  manageUsersIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#BFE3B5",
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
    color: TEXT,
  },

  manageUsersSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: MUTED,
    marginTop: 2,
  },

  categoriesCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 14,
    shadowColor: "#000000",
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
    color: TEXT,
    paddingRight: 10,
  },

  summaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: LIGHT_GREEN,
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
    backgroundColor: "#FBFEFA",
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
  },

  summaryMiniLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
    marginBottom: 3,
  },

  summaryMiniTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    lineHeight: 17,
    color: TEXT,
  },

  summaryMiniCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: MUTED,
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
    color: GREEN,
    marginBottom: 4,
  },

  categoryBarTrack: {
    width: 25,
    height: 86,
    borderRadius: 14,
    backgroundColor: "#EEF5EC",
    overflow: "hidden",
    justifyContent: "flex-end",
  },

  categoryBarFill: {
    width: "100%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: GREEN,
  },

  categoryGraphLabel: {
    width: "100%",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 8.7,
    color: MUTED,
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
    color: GREEN,
  },

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
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  smallCardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    lineHeight: 19,
    color: TEXT,
    marginBottom: 14,
  },

  trophyCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 11,
  },

  departmentName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.3,
    lineHeight: 17,
    color: TEXT,
    marginBottom: 6,
  },

  departmentRate: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: GREEN,
    marginBottom: 12,
  },

  departmentProgressTrack: {
    height: 9,
    borderRadius: 9,
    backgroundColor: TRACK,
    overflow: "hidden",
  },

  departmentProgressFill: {
    height: "100%",
    minWidth: 4,
    borderRadius: 9,
    backgroundColor: GREEN,
  },

  smallCardSpacer: {
    flex: 1,
  },

  priorityMainTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: GREEN,
    marginTop: 1,
  },

  priorityMainSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: MUTED,
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
    color: TEXT,
    paddingRight: 4,
  },

  priorityPercent: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  priorityTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: TRACK,
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
    color: MUTED,
    marginBottom: 5,
  },

  analyticsEmpty: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    paddingVertical: 8,
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

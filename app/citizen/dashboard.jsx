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
  Dimensions,
  Image,
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
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";

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

const H_PADDING = 20;
const CARD_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP * 3) / 4;

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const dashboardCardConfig = [
  {
    title: "Pending",
    statusNames: ["Pending"],
    icon: "clock-outline",
  },
  {
    title: "In Progress",
    statusNames: ["In Progress"],
    icon: "progress-wrench",
  },
  {
    title: "For Validation",
    statusNames: ["For Validation", "Validation"],
    icon: "account-check-outline",
  },
  {
    title: "Completed",
    statusNames: ["Completed"],
    icon: "check-circle-outline",
  },
];

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/citizen/dashboard",
    activePath: "citizen/dashboard",
    flex: 0.9,
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
    flex: 0.9,
  },
];

const CATEGORY_DEPARTMENT_MAP = {
  "Water Concerns": "Bogo Water District",
  "Electricity Concerns": "CEBECO II",
  "Streetlight Concerns": "City Engineering Office",
  "Road and Infrastructure Concerns": "City Engineering Office",
  "Drainage and Flooding Concerns": "City Engineering Office",
  "Waste and Environmental Concerns": "CENRO",
  "Traffic and Road Safety Concerns": "BTMO",
  "Transport Terminal Concerns": "Bogo City Central Bus Terminal Office",
  "Port Concerns": "Polambato Port Office",
  "Health and Sanitation Concerns": "City Health Office",
  "Animal Concerns": "City Veterinary Office",
  "Building and Construction Concerns": "Office of the Building Official",
  "Planning and Zoning Concerns":
    "City Planning and Development Office / Zoning Office",
  "Public Market Concerns": "Bogo Public Market Office",
  "Public Plaza Concerns": "Bogo Public Plaza Office",
  "City Facility Concerns": "General Services Office",
  "Tourism Site / Public Attraction Concerns": "City Tourism Office",
  "Disaster and Emergency Concerns": "CDRRMO",
  "Fire Safety Concerns": "BFP Bogo City Fire Station",
  "Peace and Order Concerns": "Bogo City Police Station / PNP",
  "Coastal and Marine Protection Concerns": "Bantay Dagat",
  "PWD Accessibility Concerns": "PDAO",
};

const CATEGORY_ALIASES = {
  "road & infrastructure": "Road and Infrastructure Concerns",
  "road and infrastructure": "Road and Infrastructure Concerns",
  "drainage & flooding": "Drainage and Flooding Concerns",
  "drainage and flooding": "Drainage and Flooding Concerns",
  "waste & environmental": "Waste and Environmental Concerns",
  "waste and environmental": "Waste and Environmental Concerns",
  "traffic & road safety": "Traffic and Road Safety Concerns",
  "traffic and road safety": "Traffic and Road Safety Concerns",
  "fire safety": "Fire Safety Concerns",
  "city facility": "City Facility Concerns",
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCategory(category) {
  if (!category) return "Unclassified";

  const cleanCategory = String(category).trim();

  if (CATEGORY_DEPARTMENT_MAP[cleanCategory]) return cleanCategory;

  const lowerCategory = cleanCategory.toLowerCase();

  if (CATEGORY_ALIASES[lowerCategory]) return CATEGORY_ALIASES[lowerCategory];

  const matchedCategory = Object.keys(CATEGORY_DEPARTMENT_MAP).find((item) => {
    const lowerItem = item.toLowerCase();
    const simpleItem = lowerItem.replace(" concerns", "");

    return lowerItem.includes(lowerCategory) || lowerCategory.includes(simpleItem);
  });

  return matchedCategory || cleanCategory || "Unclassified";
}

function getAssignedOffice(category, existingOffice) {
  if (existingOffice && String(existingOffice).trim()) {
    return String(existingOffice).trim();
  }

  const normalizedCategory = normalizeCategory(category);

  return CATEGORY_DEPARTMENT_MAP[normalizedCategory] || "Unassigned";
}

function normalizePhotoUrls(value) {
  if (!value) return [];

  if (Array.isArray(value)) return value.filter(Boolean);

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

function extractComplaintPhotoPath(value) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = "/storage/v1/object/public/complaint-photos/";
  const signMarker = "/storage/v1/object/sign/complaint-photos/";

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  if (!/^https?:\/\//i.test(text)) {
    return text.replace(/^complaint-photos\//, "").replace(/^\/+/, "");
  }

  return null;
}

async function createReadableComplaintPhotoUrl(value) {
  if (!value) return null;

  try {
    const path = extractComplaintPhotoPath(value);

    if (path) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from("complaint-photos")
        .createSignedUrl(path, 60 * 60);

      if (!signedError && signedData?.signedUrl) {
        return signedData.signedUrl;
      }

      const { data: publicData } = supabase.storage
        .from("complaint-photos")
        .getPublicUrl(path);

      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }
    }

    if (/^https?:\/\//i.test(String(value))) {
      return String(value);
    }
  } catch (error) {
    console.log("Resolve complaint photo error:", error);
  }

  return null;
}

async function resolveComplaintPhotoUrls(row) {
  const rawUrls = normalizePhotoUrls(row?.photo_urls);
  const resolvedUrls = [];

  for (const rawUrl of rawUrls) {
    const resolvedUrl = await createReadableComplaintPhotoUrl(rawUrl);

    if (resolvedUrl) {
      resolvedUrls.push(resolvedUrl);
    }
  }

  if (resolvedUrls.length > 0) {
    return resolvedUrls;
  }

  if (!row?.id) return [];

  try {
    const { data: files, error } = await supabase.storage
      .from("complaint-photos")
      .list(String(row.id), {
        limit: 10,
        sortBy: { column: "name", order: "asc" },
      });

    if (error || !files?.length) return [];

    const imageFiles = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();

      return (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png") ||
        name.endsWith(".heic") ||
        name.endsWith(".heif")
      );
    });

    const listedUrls = [];

    for (const file of imageFiles) {
      const storagePath = `${row.id}/${file.name}`;
      const resolvedUrl = await createReadableComplaintPhotoUrl(storagePath);

      if (resolvedUrl) {
        listedUrls.push(resolvedUrl);
      }
    }

    return listedUrls;
  } catch (error) {
    console.log("List complaint photos error:", error);
    return [];
  }
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

function getStatusVisual(status) {
  if (status === "Pending") return { bg: "#E8EEFF", color: BLUE };

  if (status === "In Progress") {
    return { bg: "#FFF2C2", color: "#A97700" };
  }

  if (status === "For Validation" || status === "Validation") {
    return { bg: LIGHT_GREEN, color: GREEN };
  }

  if (status === "Completed") return { bg: LIGHT_GREEN, color: GREEN };

  return { bg: "#F1F1F1", color: MUTED };
}

function getPriorityVisual(priority) {
  if (priority === "Critical" || priority === "Urgent") {
    return { bg: "#FFF0F0", color: RED };
  }

  if (priority === "High") return { bg: "#FFF2E8", color: ORANGE };

  if (priority === "Low") return { bg: "#F1F4F1", color: MUTED };

  return { bg: LIGHT_GREEN, color: GREEN };
}

function normalizeConcernType(value, isEmergency = false) {
  const cleanValue = normalizeText(value);

  if (
    isEmergency ||
    cleanValue === "emergency" ||
    (cleanValue.includes("emergency") && !cleanValue.includes("non"))
  ) {
    return "Emergency";
  }

  return "Non-Emergency";
}

function getConcernVisual(concernType) {
  if (concernType === "Emergency") {
    return { bg: "#FFF0F0", color: RED };
  }

  return { bg: LIGHT_GREEN, color: GREEN };
}

async function mapDashboardComplaint(row) {
  const createdAt =
    row.created_at || row.submitted_at || new Date().toISOString();

  const category = normalizeCategory(row.category || row.concern_category);

  const assignedOffice = getAssignedOffice(
    category,
    row.assigned_office || row.assignedOffice || row.department
  );

  const concernType = normalizeConcernType(row.complaint_type, row.is_emergency);
  const priority = row.priority || (row.is_emergency ? "Critical" : "Normal");
  const status = row.status || "Pending";
  const photoUrls = await resolveComplaintPhotoUrls(row);
  const photo = photoUrls[0] || PHOTO_PLACEHOLDER;

  const statusVisual = getStatusVisual(status);
  const priorityVisual = getPriorityVisual(priority);
  const concernVisual = getConcernVisual(concernType);

  return {
    id: row.short_id || row.id,
    rawId: row.id,
    title: row.title || "Untitled Complaint",
    category,
    concernType,
    description: row.description || "No description provided.",
    location: row.location_text || row.location || "Location not available",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    createdAt,
    assignedOffice,
    priority,
    status,
    statusBg: statusVisual.bg,
    statusColor: statusVisual.color,
    priorityBg: priorityVisual.bg,
    priorityColor: priorityVisual.color,
    concernBg: concernVisual.bg,
    concernColor: concernVisual.color,
    photo,
  };
}

function getGreetingByTime(date) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) return "Maayong Buntag,";
  if (hour >= 11 && hour < 13) return "Maayong Udto,";
  if (hour >= 13 && hour < 18) return "Maayong Hapon,";

  return "Maayong Gabii,";
}

function getFormattedDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function parseComplaintDateTime(date, time) {
  const months = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11,
  };

  const dateMatch = date?.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const timeMatch = time?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!dateMatch) return 0;

  const month = months[dateMatch[1]];
  const day = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);

  if (month === undefined) return 0;

  let hour = 0;
  let minute = 0;

  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);

    const meridiem = timeMatch[3].toUpperCase();

    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;
  }

  return new Date(year, month, day, hour, minute).getTime();
}

export default function CitizenDashboard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    console.log("CITIZEN DASHBOARD: registering push token...");
    registerPushTokenForCurrentUser();
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [complaintModalVisible, setComplaintModalVisible] = useState(false);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(null);
  const [complaintsData, setComplaintsData] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    
  });

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

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

  const loadUserProfilePhoto = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error || !currentUser) {
        setCurrentUserId(null);
        setProfilePhotoUrl(null);
        return;
      }

      setCurrentUserId(currentUser.id);

      const metadataAvatar = currentUser.user_metadata?.avatar_url || null;

      if (metadataAvatar) {
        setProfilePhotoUrl(metadataAvatar);
        return;
      }

      const { data: profileData } = await supabase
        .from("citizen_profiles")
        .select("avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      setProfilePhotoUrl(profileData?.avatar_url || null);
    } catch {
      setProfilePhotoUrl(null);
    }
  }, []);

  const loadUnreadNotificationCount = useCallback(async (userId = null) => {
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
        console.log("Dashboard unread notification count error:", error);
        setUnreadNotificationCount(0);
        return;
      }

      setUnreadNotificationCount(count || 0);
    } catch (error) {
      console.log("Load dashboard unread notification count error:", error);
      setUnreadNotificationCount(0);
    }
  }, [currentUserId]);

  const loadDashboardComplaints = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        setCurrentUserId(null);
        setComplaintsData([]);
        setUnreadNotificationCount(0);
        return;
      }

      setCurrentUserId(currentUser.id);
      await loadUnreadNotificationCount(currentUser.id);

      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("citizen_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Dashboard complaints load error:", error);
        setComplaintsData([]);
        return;
      }

      const mappedComplaints = await Promise.all(
        (data || []).map((row) => mapDashboardComplaint(row))
      );

      setComplaintsData(mappedComplaints);
    } catch (error) {
      console.log("Dashboard complaints load error:", error);
      setComplaintsData([]);
    }
  }, [loadUnreadNotificationCount]);

  useFocusEffect(
    useCallback(() => {
      loadUserProfilePhoto();
      loadDashboardComplaints();
    }, [loadUserProfilePhoto, loadDashboardComplaints])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    const notificationChannel = supabase
      .channel(`dashboard-notification-badge-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaint_notifications",
          filter: `citizen_id=eq.${currentUserId}`,
        },
        () => {
          loadUnreadNotificationCount(currentUserId);
        }
      )
      .subscribe();

    const complaintsChannel = supabase
      .channel(`dashboard-complaints-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${currentUserId}`,
        },
        () => {
          loadDashboardComplaints();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(complaintsChannel);
    };
  }, [currentUserId, loadUnreadNotificationCount, loadDashboardComplaints]);

  const greeting = useMemo(() => getGreetingByTime(currentDate), [currentDate]);

  const complaints = complaintsData;

  const formattedDate = useMemo(
    () => getFormattedDate(currentDate),
    [currentDate]
  );

  const dashboardCards = useMemo(() => {
    return dashboardCardConfig.map((card) => ({
      ...card,
      value: complaints
        .filter((complaint) => card.statusNames.includes(complaint.status))
        .length.toString(),
    }));
  }, [complaints]);

  const latestComplaints = useMemo(() => {
    return [...complaints]
      .sort(
        (a, b) =>
          parseComplaintDateTime(b.date, b.time) -
          parseComplaintDateTime(a.date, a.time)
      )
      .slice(0, 4);
  }, [complaints]);

  const openComplaintDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setComplaintModalVisible(true);
  };

  const closeComplaintDetails = () => {
    setComplaintModalVisible(false);
    setSelectedComplaint(null);
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

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.headerNotificationButton}
              onPress={() =>
                smoothNavigate("/citizen/notification")
              }
            >
              <Ionicons name="notifications-outline" size={25} color={TEXT} />

              {unreadNotificationCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadNotificationCount > 99
                      ? "99+"
                      : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.avatarCircle}
              onPress={() => smoothNavigate("/citizen/profile")}
            >
              {profilePhotoUrl ? (
                <Image
                  source={{ uri: profilePhotoUrl }}
                  style={styles.avatar}
                  onError={() => setProfilePhotoUrl(null)}
                />
              ) : (
                <Ionicons name="person" size={25} color={GREEN} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>{greeting}</Text>
            <Text style={styles.greetingLarge}>Bogohanon!</Text>
            <Text style={styles.dateText}>{formattedDate}</Text>
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Dashboard</Text>
          </View>

          <View style={styles.dashboardCardsRow}>
            {dashboardCards.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.dashboardCard,
                  {
                    width: CARD_WIDTH,
                    marginRight:
                      index === dashboardCards.length - 1 ? 0 : CARD_GAP,
                  },
                ]}
              >
                <View style={styles.cardIconCircle}>
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={23}
                    color={WHITE}
                  />
                </View>

                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionRow}>
            <Text style={styles.myComplaintsTitle}>My Complaints</Text>

            <TouchableOpacity
              style={styles.viewAllRow}
              activeOpacity={0.75}
              onPress={() => smoothNavigate("/citizen/complaints")}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Feather name="chevron-right" size={17} color={MUTED} />
            </TouchableOpacity>
          </View>

          <View style={styles.complaintsList}>
            {latestComplaints.length === 0 ? (
              <View style={styles.emptyComplaintsCard}>
                <Ionicons name="document-text-outline" size={30} color={MUTED} />
                <Text style={styles.emptyComplaintsTitle}>
                  No submitted complaints yet
                </Text>
                <Text style={styles.emptyComplaintsText}>
                  Your latest submitted complaints will appear here.
                </Text>
              </View>
            ) : (
              latestComplaints.map((item) => (
                <TouchableOpacity
                  key={item.rawId || item.id}
                  style={styles.complaintCard}
                  activeOpacity={0.75}
                  onPress={() => openComplaintDetails(item)}
                >
                  <View style={styles.complaintInfo}>
                    <Text style={styles.complaintTitle} numberOfLines={1}>
                      {item.title}
                    </Text>

                    <View style={styles.detailRow}>
                      <Feather name="tag" size={13} color={MUTED} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {item.category}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Feather name="map-pin" size={13} color={MUTED} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Feather name="calendar" size={13} color={MUTED} />
                      <Text style={styles.detailText}>{item.date}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Feather name="clock" size={13} color={MUTED} />
                      <Text style={styles.detailText}>{item.time}</Text>
                    </View>
                  </View>

                  <View style={styles.complaintRight}>
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

                    <Feather name="chevron-right" size={21} color={MUTED} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
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
                onPress={() => smoothNavigate(tab.route, isActive)}
              >
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={26}
                  color={isActive ? GREEN : TEXT}
                />

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
          visible={complaintModalVisible}
          transparent
          animationType="slide"
          onRequestClose={closeComplaintDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.complaintDetailsSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Complaint Information</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={closeComplaintDetails}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              {selectedComplaint && (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.modalScrollContent}
                >
                  <Image
                    source={{ uri: selectedComplaint.photo }}
                    style={styles.complaintDetailsImage}
                  />

                  <View style={styles.modalTitleSection}>
                    <Text style={styles.complaintDetailsTitle}>
                      {selectedComplaint.title}
                    </Text>

                    <Text style={styles.complaintDetailsId}>
                      Complaint ID: {selectedComplaint.id}
                    </Text>
                  </View>

                  <View style={styles.badgeRow}>
                    <View
                      style={[
                        styles.modalStatusBadge,
                        { backgroundColor: selectedComplaint.statusBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalStatusText,
                          { color: selectedComplaint.statusColor },
                        ]}
                      >
                        {selectedComplaint.status}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.modalPriorityBadge,
                        { backgroundColor: selectedComplaint.priorityBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalPriorityText,
                          { color: selectedComplaint.priorityColor },
                        ]}
                      >
                        {selectedComplaint.priority} Priority
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.modalConcernBadge,
                        { backgroundColor: selectedComplaint.concernBg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalConcernText,
                          { color: selectedComplaint.concernColor },
                        ]}
                      >
                        {selectedComplaint.concernType}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.descriptionBox}>
                    <Text style={styles.infoLabel}>Description</Text>
                    <Text style={styles.descriptionText}>
                      {selectedComplaint.description}
                    </Text>
                  </View>

                  <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather name="tag" size={15} color={GREEN} />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Category</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.category}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather
                          name={
                            selectedComplaint.concernType === "Emergency"
                              ? "alert-triangle"
                              : "check-circle"
                          }
                          size={15}
                          color={GREEN}
                        />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Concern Type</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.concernType}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather name="map-pin" size={15} color={GREEN} />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Location</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.location}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather name="calendar" size={15} color={GREEN} />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Date Submitted</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.date}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather name="clock" size={15} color={GREEN} />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Time Submitted</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.time}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.infoRow}>
                      <View style={styles.infoIconCircle}>
                        <Feather name="briefcase" size={15} color={GREEN} />
                      </View>

                      <View style={styles.infoTextBox}>
                        <Text style={styles.infoLabel}>Assigned Office</Text>
                        <Text style={styles.infoValue}>
                          {selectedComplaint.assignedOffice}
                        </Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
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

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    paddingBottom: 100,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
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
    backgroundColor: "transparent",
  },

  logoTextLight: {
    color: ACCENT_GREEN,
  },

  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
  },

  headerNotificationButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    position: "relative",
  },

  notificationBadge: {
    position: "absolute",
    top: 3,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9,
    color: WHITE,
    lineHeight: 12,
    textAlign: "center",
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

  avatar: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
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

  dateText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: MUTED,
    marginTop: 4,
    letterSpacing: 0.4,
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

  myComplaintsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: GREEN,
    letterSpacing: 0.2,
  },

  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  viewAllText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: MUTED,
    marginRight: 2,
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
    fontSize: 10.7,
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

  complaintsList: {
    marginTop: 0,
  },

  emptyComplaintsCard: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 18,
  },

  emptyComplaintsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: TEXT,
    marginTop: 8,
  },

  emptyComplaintsText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
    marginTop: 3,
  },

  complaintCard: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  complaintInfo: {
    flex: 1,
    paddingRight: 8,
  },

  complaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: TEXT,
    marginBottom: 1,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
  },

  detailText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginLeft: 7,
    flexShrink: 1,
  },

  complaintRight: {
    width: 145,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  statusBadge: {
    minWidth: 112,
    height: 26,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.3,
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

  navLabel: {
    fontSize: 9.4,
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

  complaintDetailsSheet: {
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

  modalScrollContent: {
    paddingBottom: 10,
  },

  complaintDetailsImage: {
    width: "100%",
    height: 165,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E8E8E8",
    marginBottom: 13,
  },

  modalTitleSection: {
    marginBottom: 10,
  },

  complaintDetailsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: TEXT,
  },

  complaintDetailsId: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },

  modalStatusBadge: {
    minWidth: 98,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  modalStatusText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
  },

  modalPriorityBadge: {
    minWidth: 105,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  modalPriorityText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
  },

  modalConcernBadge: {
    minWidth: 108,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  modalConcernText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
  },

  descriptionBox: {
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 12,
  },

  descriptionText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 3,
  },

  infoCard: {
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 14,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  infoTextBox: {
    flex: 1,
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
});
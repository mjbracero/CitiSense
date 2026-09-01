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
import { ComplaintListSkeleton, PageSkeleton } from "../../components/skeletons";
import FullscreenPhotoViewer from "../../components/FullscreenPhotoViewer";
import {
  calculatePriorityFromKeywords,
  detectComplaintCategoryFromKeywords,
  getAssignedOffice as getAssignedOfficeFromCategory,
  normalizeComplaintCategory,
} from "../../lib/complaintCategories";
import {
  canCitizenSubmitValidation,
  getLatestFeedbackStatusByComplaintIds,
  isValidationResubmit,
} from "../../lib/complaintFeedbackService";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import {
  applyOffsetPagination,
  COMPLAINTS_PAGE_SIZE,
  fetchAllRowsWithOffset,
} from "../../lib/complaintPagination";
import {
  getProfileAvatarUrl,
  setProfileAvatarUrl,
  subscribeProfileAvatar,
} from "../../lib/profileAvatarStore";
import { supabase } from "../../lib/supabase";
import { registerPushTokenForCurrentUser } from "../../lib/pushNotifications";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

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
const CITIZEN_DASHBOARD_CACHE_KEY = "citizen.dashboard";

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const dashboardCardConfig = [
  {
    title: "Pending",
    statusNames: ["Pending"],
    filter: "Pending",
    icon: "clock-outline",
  },
  {
    title: "In Progress",
    statusNames: ["In Progress"],
    filter: "In Progress",
    icon: "progress-wrench",
  },
  {
    title: "For Validation",
    statusNames: ["For Validation", "Validation"],
    filter: "For Validation",
    icon: "account-check-outline",
  },
  {
    title: "Completed",
    statusNames: ["Completed"],
    filter: "Completed",
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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
        limit: 20,
        sortBy: { column: "name", order: "asc" },
      });

    if (error || !files?.length) return [];

    const imageFiles = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();

      if (name.startsWith("validation-")) return false;

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

function normalizeValidationPhotoUrls(value) {
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

async function resolveValidationPhotoUrls(row) {
  const rawUrls = normalizeValidationPhotoUrls(
    row?.citizen_validation_photo_urls ||
      row?.validation_photo_urls ||
      row?.citizen_feedback_photo_urls
  );

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
        limit: 20,
        sortBy: { column: "name", order: "asc" },
      });

    if (error || !files?.length) return [];

    const validationFiles = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();
      return name.startsWith("validation-");
    });

    const listedUrls = [];

    for (const file of validationFiles) {
      const storagePath = `${row.id}/${file.name}`;
      const resolvedUrl = await createReadableComplaintPhotoUrl(storagePath);

      if (resolvedUrl) {
        listedUrls.push(resolvedUrl);
      }
    }

    return listedUrls;
  } catch (error) {
    console.log("List validation photos error:", error);
    return [];
  }
}

function buildTimeline(status, createdAt, assignedOffice) {
  const submittedTime = `${formatDbDate(createdAt)} • ${formatDbTime(createdAt)}`;

  const hasAssignedOffice = Boolean(
    assignedOffice && assignedOffice !== "Unassigned"
  );

  const statusOrder = [
    "Submitted",
    "AI Analysis",
    "Routed",
    "In Progress",
    "For Validation",
    "Completed",
  ];

  const currentIndex =
    status === "Completed"
      ? 5
      : status === "For Validation"
        ? 4
        : status === "In Progress"
          ? 3
          : hasAssignedOffice
            ? 2
            : 1;

  return statusOrder.map((label, index) => ({
    label,
    done: index <= currentIndex,
    time:
      index === 0
        ? submittedTime
        : index === 1
          ? submittedTime
          : index === 2 && hasAssignedOffice
            ? `Assigned to ${assignedOffice}`
            : index <= currentIndex
              ? submittedTime
              : "Waiting",
  }));
}

function getDisplayComplaintId(row) {
  if (row.short_id) return String(row.short_id);
  if (row.complaint_short_id) return String(row.complaint_short_id);
  if (row.id) return String(row.id).slice(0, 8).toUpperCase();

  return "N/A";
}

function getValidationSubmitted(row) {
  const directFlags = [
    row.validation_status,
    row.citizen_validation_status,
    row.citizen_feedback_status,
  ]
    .filter(Boolean)
    .map((item) => String(item).trim().toLowerCase());

  return Boolean(
    row.citizen_validated_at ||
      row.validation_submitted_at ||
      row.citizen_feedback_submitted_at ||
      row.citizen_feedback_submitted === true ||
      directFlags.includes("validated") ||
      directFlags.includes("submitted") ||
      directFlags.includes("done")
  );
}

function getStatusStyle(status) {
  if (status === "Pending") {
    return { bg: "#E8EEFF", color: BLUE, icon: "clock-outline" };
  }

  if (status === "In Progress") {
    return { bg: "#FFF8D6", color: "#C9A000", icon: "progress-wrench" };
  }

  if (status === "For Validation" || status === "Validation") {
    return { bg: "#F3EAFF", color: "#7A3EA8", icon: "clipboard-check-outline" };
  }

  if (status === "Completed") {
    return { bg: "#DFF0DF", color: GREEN, icon: "check-circle-outline" };
  }

  if (status === "Returned") {
    return { bg: "#FFF0F0", color: RED, icon: "backup-restore" };
  }

  return { bg: "#F1F1F1", color: MUTED, icon: "file-document-outline" };
}

function getDashboardStatusRank(status) {
  if (status === "Returned") return 0;
  if (status === "For Validation" || status === "Validation") return 1;
  return 2;
}

function getPriorityStyle(priority) {
  if (priority === "Critical" || priority === "Urgent") {
    return { bg: "#FFF0F0", color: RED };
  }

  if (priority === "High") return { bg: "#FFF2E8", color: ORANGE };

  if (priority === "Low") return { bg: "#F1F4F1", color: MUTED };

  return { bg: LIGHT_GREEN, color: GREEN };
}

function normalizeConcernType(value, isEmergency = false, priority = "Normal") {
  const cleanValue = normalizeText(value);

  if (
    isEmergency ||
    priority === "Critical" ||
    cleanValue === "emergency" ||
    (cleanValue.includes("emergency") && !cleanValue.includes("non"))
  ) {
    return "Emergency";
  }

  return "Non-Emergency";
}

function getConcernStyle(concernType) {
  if (concernType === "Emergency") {
    return { bg: "#FFF0F0", color: RED, icon: "alert-triangle" };
  }

  return { bg: LIGHT_GREEN, color: GREEN, icon: "check-circle" };
}

async function mapDashboardComplaint(row) {
  const createdAt =
    row.created_at ||
    row.submitted_at ||
    row.submitted_date_time ||
    new Date().toISOString();

  const detectedCategory = detectComplaintCategoryFromKeywords(
    row.title,
    row.description
  );

  const category =
    !row.category ||
    row.category === "Unclassified" ||
    row.category === "Unassigned"
      ? detectedCategory
      : normalizeComplaintCategory(row.category || row.concern_category);

  const assignedOffice = getAssignedOfficeFromCategory(
    category,
    row.assigned_office || row.assignedOffice || row.department
  );

  const priority = calculatePriorityFromKeywords(
    row.title,
    row.description,
    Boolean(row.is_emergency)
  );

  const concernType = normalizeConcernType(
    row.complaint_type,
    Boolean(row.is_emergency),
    priority
  );

  const photoUrls = await resolveComplaintPhotoUrls(row);
  const photo = photoUrls[0] || PHOTO_PLACEHOLDER;
  const validationPhotoUrls = await resolveValidationPhotoUrls(row);
  const status = row.status || "Pending";

  return {
    id: row.id,
    rawId: row.id,
    shortId: getDisplayComplaintId(row),
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
    latestFeedbackStatus: row.latest_feedback_status || null,
    validationSubmitted: getValidationSubmitted(row),
    validationPhotoUrls,
    photo,
    photoUrls,
    timeline: buildTimeline(status, createdAt, assignedOffice),
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

  const cachedDashboard = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [complaintModalVisible, setComplaintModalVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useHideBottomNav(complaintModalVisible);

  const [profilePhotoUrl, setProfilePhotoUrl] = useState(
    getProfileAvatarUrl() || cachedDashboard?.profilePhotoUrl || null
  );
  const [complaintsData, setComplaintsData] = useState(
    cachedDashboard?.complaints ?? []
  );
  const [loadingComplaints, setLoadingComplaints] = useState(!cachedDashboard);
  const [currentUserId, setCurrentUserId] = useState(
    cachedDashboard?.currentUserId ?? null
  );
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(
    cachedDashboard?.unreadNotificationCount ?? 0
  );

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
        setProfileAvatarUrl(null);
        return;
      }

      setCurrentUserId(currentUser.id);

      const metadataAvatar = currentUser.user_metadata?.avatar_url || null;

      if (metadataAvatar) {
        setProfilePhotoUrl(metadataAvatar);
        setProfileAvatarUrl(metadataAvatar);
        const prev = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY) || {};
        setPageCache(CITIZEN_DASHBOARD_CACHE_KEY, {
          ...prev,
          currentUserId: currentUser.id,
          profilePhotoUrl: metadataAvatar,
        });
        return;
      }

      const { data: profileData } = await supabase
        .from("citizen_profiles")
        .select("avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      const nextPhoto = profileData?.avatar_url || null;
      setProfilePhotoUrl(nextPhoto);
      setProfileAvatarUrl(nextPhoto);
      const prev = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(CITIZEN_DASHBOARD_CACHE_KEY, {
        ...prev,
        currentUserId: currentUser.id,
        profilePhotoUrl: nextPhoto,
      });
    } catch {
      setProfilePhotoUrl(null);
    }
  }, []);

  useEffect(() => {
    return subscribeProfileAvatar((url) => {
      setProfilePhotoUrl(url);
      const prev = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(CITIZEN_DASHBOARD_CACHE_KEY, {
        ...prev,
        profilePhotoUrl: url,
      });
    });
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
      const prev = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(CITIZEN_DASHBOARD_CACHE_KEY, {
        ...prev,
        unreadNotificationCount: count || 0,
      });
    } catch (error) {
      console.log("Load dashboard unread notification count error:", error);
      setUnreadNotificationCount(0);
    }
  }, [currentUserId]);

  const loadDashboardComplaints = useCallback(async () => {
    try {
      if (shouldShowPageLoader(CITIZEN_DASHBOARD_CACHE_KEY)) {
        setLoadingComplaints(true);
      }

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !currentUser) {
        if (shouldShowPageLoader(CITIZEN_DASHBOARD_CACHE_KEY)) {
          setCurrentUserId(null);
          setComplaintsData([]);
          setUnreadNotificationCount(0);
        }
        return;
      }

      setCurrentUserId(currentUser.id);
      await loadUnreadNotificationCount(currentUser.id);

      const { data, error } = await fetchAllRowsWithOffset(async (offset, pageSize) => {
        const query = applyOffsetPagination(
          supabase
            .from("complaints")
            .select("*", { count: offset === 0 ? "exact" : undefined })
            .eq("citizen_id", currentUser.id)
            .order("created_at", { ascending: false }),
          offset,
          pageSize
        );

        return await query;
      }, COMPLAINTS_PAGE_SIZE);

      if (error) {
        console.log("Dashboard complaints load error:", error);
        if (shouldShowPageLoader(CITIZEN_DASHBOARD_CACHE_KEY)) {
          setComplaintsData([]);
        }
        return;
      }

      const rows = data || [];
      const feedbackStatusById = await getLatestFeedbackStatusByComplaintIds(
        rows.map((row) => row.id)
      );

      const mappedComplaints = await Promise.all(
        rows.map((row) =>
          mapDashboardComplaint({
            ...row,
            latest_feedback_status: feedbackStatusById[row.id] || null,
          })
        )
      );

      setComplaintsData(mappedComplaints);
      const prev = getPageCache(CITIZEN_DASHBOARD_CACHE_KEY) || {};
      setPageCache(CITIZEN_DASHBOARD_CACHE_KEY, {
        ...prev,
        complaints: mappedComplaints,
        currentUserId: currentUser.id,
      });
    } catch (error) {
      console.log("Dashboard complaints load error:", error);
      if (shouldShowPageLoader(CITIZEN_DASHBOARD_CACHE_KEY)) {
        setComplaintsData([]);
      }
    } finally {
      setLoadingComplaints(false);
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
      .sort((a, b) => {
        const rank =
          getDashboardStatusRank(a.status) - getDashboardStatusRank(b.status);

        if (rank !== 0) return rank;

        return (
          parseComplaintDateTime(b.date, b.time) -
          parseComplaintDateTime(a.date, a.time)
        );
      })
      .slice(0, 4);
  }, [complaints]);

  const openComplaintDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setComplaintModalVisible(true);
  };

  const closeComplaintDetails = () => {
    setComplaintModalVisible(false);
    setSelectedComplaint(null);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  const openPhotoViewer = (uri) => {
    if (!uri) return;
    if (
      String(uri).includes("placehold.co") ||
      String(uri).includes("placeholder")
    ) {
      return;
    }
    setSelectedPhoto(uri);
    setPhotoViewerVisible(true);
  };

  const closePhotoViewer = () => {
    setPhotoViewerVisible(false);
    setTimeout(() => {
      setSelectedPhoto(null);
    }, 160);
  };

  if (!fontsLoaded && !cachedDashboard) {
    return <PageSkeleton variant="dashboard" />;
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
                    pathname: "/citizen/complaints",
                    params: { filter: item.filter },
                  })
                }
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
              </TouchableOpacity>
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
            {loadingComplaints && complaintsData.length === 0 ? (
              <ComplaintListSkeleton count={3} />
            ) : latestComplaints.length === 0 ? (
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
              latestComplaints.map((item) => {
                const statusStyle = getStatusStyle(item.status);
                const priorityStyle = getPriorityStyle(item.priority);
                const concernStyle = getConcernStyle(item.concernType);

                return (
                  <TouchableOpacity
                    key={item.rawId || item.id}
                    style={styles.complaintCard}
                    activeOpacity={0.75}
                    onPress={() => openComplaintDetails(item)}
                  >
                    <View style={styles.cardTopRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.complaintImageWrapper}
                        onPress={() => openPhotoViewer(item.photo)}
                      >
                        <Image
                          source={{ uri: item.photo }}
                          style={styles.complaintImage}
                        />
                      </TouchableOpacity>

                      <View style={styles.complaintInfo}>
                        <View style={styles.idRow}>
                          <Text style={styles.complaintId}>
                            #{item.shortId || item.id}
                          </Text>

                          <View
                            style={[
                              styles.priorityPill,
                              { backgroundColor: priorityStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.priorityText,
                                { color: priorityStyle.color },
                              ]}
                            >
                              {item.priority}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.complaintTitle} numberOfLines={1}>
                          {item.title}
                        </Text>

                        <View style={styles.categoryConcernRow}>
                          <Text style={styles.categoryText} numberOfLines={1}>
                            {item.category}
                          </Text>

                          <View
                            style={[
                              styles.concernPill,
                              { backgroundColor: concernStyle.bg },
                            ]}
                          >
                            <Feather
                              name={concernStyle.icon}
                              size={9}
                              color={concernStyle.color}
                            />
                            <Text
                              style={[
                                styles.concernText,
                                { color: concernStyle.color },
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.82}
                            >
                              {item.concernType}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <View style={styles.detailRow}>
                      <Feather name="tag" size={13} color={MUTED} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        Category: {item.category}
                      </Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Feather name="briefcase" size={13} color={MUTED} />
                      <Text style={styles.detailText} numberOfLines={1}>
                        Assigned Office: {item.assignedOffice}
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

                    <View style={styles.cardBottomRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: statusStyle.bg },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={statusStyle.icon}
                          size={15}
                          color={statusStyle.color}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: statusStyle.color },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>

                      <View style={styles.viewRow}>
                        <Text style={styles.viewText}>View Details</Text>
                        <Feather name="chevron-right" size={16} color={GREEN} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>

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
                <Text style={styles.modalTitle}>Complaint Details</Text>

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
                  {(() => {
                    const detailPhotos = (
                      selectedComplaint.photoUrls || []
                    ).filter(Boolean);
                    const photosToShow =
                      detailPhotos.length > 0
                        ? detailPhotos
                        : selectedComplaint.photo
                          ? [selectedComplaint.photo]
                          : [];
                    const validationPhotos = (
                      selectedComplaint.validationPhotoUrls || []
                    ).filter(Boolean);

                    return (
                      <>
                        {photosToShow.length > 0 ? (
                          photosToShow.length === 1 ? (
                            <TouchableOpacity
                              activeOpacity={0.85}
                              onPress={() => openPhotoViewer(photosToShow[0])}
                            >
                              <Image
                                source={{ uri: photosToShow[0] }}
                                style={styles.complaintDetailsImage}
                              />
                            </TouchableOpacity>
                          ) : (
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={styles.detailsPhotoRow}
                            >
                              {photosToShow.map((photo, index) => (
                                <TouchableOpacity
                                  key={`${photo}-${index}`}
                                  activeOpacity={0.85}
                                  onPress={() => openPhotoViewer(photo)}
                                >
                                  <Image
                                    source={{ uri: photo }}
                                    style={styles.detailsGalleryPhoto}
                                  />
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          )
                        ) : (
                          <Image
                            source={{ uri: PHOTO_PLACEHOLDER }}
                            style={styles.complaintDetailsImage}
                          />
                        )}

                        {validationPhotos.length > 0 && (
                          <View style={styles.detailsValidationPhotosBox}>
                            <Text style={styles.detailsLabel}>
                              Validation Photos
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={styles.detailsPhotoRow}
                            >
                              {validationPhotos.map((photo, index) => (
                                <TouchableOpacity
                                  key={`validation-${photo}-${index}`}
                                  activeOpacity={0.85}
                                  onPress={() => openPhotoViewer(photo)}
                                >
                                  <Image
                                    source={{ uri: photo }}
                                    style={styles.detailsGalleryPhoto}
                                  />
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        )}
                      </>
                    );
                  })()}

                  <Text style={styles.complaintDetailsTitle}>
                    {selectedComplaint.title}
                  </Text>

                  <Text style={styles.detailsDescription}>
                    {selectedComplaint.description}
                  </Text>

                  <View style={styles.detailsInfoCard}>
                    <Text style={styles.detailsLabel}>Complaint ID</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.shortId || selectedComplaint.id}
                    </Text>

                    <Text style={styles.detailsLabel}>Concern Type</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.concernType}
                    </Text>

                    <Text style={styles.detailsLabel}>Category</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.category}
                    </Text>

                    <Text style={styles.detailsLabel}>Priority</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.priority}
                    </Text>

                    <Text style={styles.detailsLabel}>Status</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.status}
                    </Text>

                    <Text style={styles.detailsLabel}>Assigned Office</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.assignedOffice}
                    </Text>

                    <Text style={styles.detailsLabel}>Location</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.location}
                    </Text>

                    <Text style={styles.detailsLabel}>Date Submitted</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.date}
                    </Text>

                    <Text style={styles.detailsLabel}>Time Submitted</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.time}
                    </Text>
                  </View>

                  <Text style={styles.timelineTitle}>Status Timeline</Text>

                  <View style={styles.timelineBox}>
                    {(selectedComplaint.timeline || []).map((step, index) => (
                      <View key={step.label} style={styles.timelineRow}>
                        <View style={styles.timelineIndicatorBox}>
                          <View
                            style={[
                              styles.timelineCircle,
                              step.done && styles.timelineCircleDone,
                            ]}
                          >
                            {step.done && (
                              <Feather name="check" size={11} color={WHITE} />
                            )}
                          </View>

                          {index !==
                            (selectedComplaint.timeline || []).length - 1 && (
                            <View
                              style={[
                                styles.timelineLine,
                                step.done && styles.timelineLineDone,
                              ]}
                            />
                          )}
                        </View>

                        <View style={styles.timelineTextBox}>
                          <Text
                            style={[
                              styles.timelineStep,
                              step.done && styles.timelineStepDone,
                            ]}
                          >
                            {step.label}
                          </Text>
                          <Text style={styles.timelineTime}>{step.time}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {canCitizenSubmitValidation(selectedComplaint) ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.returnedActionButton}
                      onPress={() => {
                        closeComplaintDetails();
                        router.push({
                          pathname: "/citizen/complaints",
                          params: {
                            complaintId:
                              selectedComplaint.rawId || selectedComplaint.id,
                            filter: "For Validation",
                          },
                        });
                      }}
                    >
                      <Ionicons name="camera-outline" size={18} color={WHITE} />
                      <Text style={styles.returnedActionText}>
                        {isValidationResubmit(selectedComplaint)
                          ? "Submit Validation Again"
                          : "Provide Feedback & Photo Evidence"}
                      </Text>
                    </TouchableOpacity>
                  ) : selectedComplaint.status === "For Validation" &&
                    selectedComplaint.validationSubmitted ? (
                    <View style={styles.validatedNotice}>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color={MUTED}
                      />
                      <Text style={styles.validatedNoticeText}>
                        Validated — waiting for admin review
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>

            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && complaintModalVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        <FullscreenPhotoViewer
          visible={photoViewerVisible && !complaintModalVisible}
          uri={selectedPhoto}
          onClose={closePhotoViewer}
        />
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
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
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
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 13,
    marginBottom: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 9,
  },

  complaintImageWrapper: {
    width: 64,
    height: 58,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#E8E8E8",
    marginRight: 10,
  },

  complaintImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  complaintInfo: {
    flex: 1,
  },

  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  complaintId: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: MUTED,
  },

  priorityPill: {
    minWidth: 48,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  priorityText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.5,
  },

  complaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: TEXT,
    marginTop: 2,
  },

  categoryConcernRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 6,
  },

  categoryText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    paddingRight: 2,
  },

  concernPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 11,
    paddingHorizontal: 7,
    paddingVertical: 3,
    minHeight: 21,
    flexShrink: 0,
    maxWidth: "58%",
    overflow: "hidden",
  },

  concernText: {
    flexShrink: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
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

  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },

  statusBadge: {
    minWidth: 105,
    height: 26,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    gap: 5,
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.3,
  },

  viewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },

  viewText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11.5,
    color: GREEN,
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

  detailsPhotoRow: {
    gap: 10,
    paddingRight: 8,
    marginBottom: 13,
  },

  detailsGalleryPhoto: {
    width: 176,
    height: 165,
    borderRadius: 16,
    backgroundColor: "#E8E8E8",
  },

  detailsValidationPhotosBox: {
    marginBottom: 8,
  },

  complaintDetailsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: TEXT,
  },

  detailsDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 5,
    marginBottom: 12,
  },

  detailsInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 14,
  },

  detailsLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
    marginTop: 8,
  },

  detailsValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: TEXT,
    marginTop: 2,
  },

  timelineTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: TEXT,
    marginBottom: 10,
  },

  timelineBox: {
    marginBottom: 14,
  },

  timelineRow: {
    flexDirection: "row",
    minHeight: 46,
  },

  timelineIndicatorBox: {
    width: 22,
    alignItems: "center",
    marginRight: 10,
  },

  timelineCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },

  timelineCircleDone: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: BORDER,
    marginTop: 3,
    marginBottom: 3,
  },

  timelineLineDone: {
    backgroundColor: GREEN,
  },

  timelineTextBox: {
    flex: 1,
    paddingBottom: 12,
  },

  timelineStep: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
  },

  timelineStepDone: {
    color: TEXT,
    fontFamily: "Poppins_600SemiBold",
  },

  timelineTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },

  returnedActionButton: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  returnedActionText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: WHITE,
  },

  validatedNotice: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: BG,
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },

  validatedNoticeText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: MUTED,
  },
});
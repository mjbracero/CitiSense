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
import { createCitizenNotificationAndPush } from "../../lib/citizenNotificationService";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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

const H_PADDING = 20;

const emergencyPriorityLevels = ["Critical", "Urgent", "High"];

const concernTypeFilters = ["All Concerns", "Emergency", "Non-Emergency"];

const categoryFilters = [
  "All Category",
  "Water Concerns",
  "Electricity Concerns",
  "Streetlight Concerns",
  "Road and Infrastructure Concerns",
  "Drainage and Flooding Concerns",
  "Waste and Environmental Concerns",
  "Traffic and Road Safety Concerns",
  "Transport Terminal Concerns",
  "Port Concerns",
  "Health and Sanitation Concerns",
  "Animal Concerns",
  "Building and Construction Concerns",
  "Planning and Zoning Concerns",
  "Public Market Concerns",
  "Public Plaza Concerns",
  "City Facility Concerns",
  "Tourism Site / Public Attraction Concerns",
  "Disaster and Emergency Concerns",
  "Fire Safety Concerns",
  "Peace and Order Concerns",
  "Coastal and Marine Protection Concerns",
  "PWD Accessibility Concerns",
];

const statusFilters = [
  "All Status",
  "Pending",
  "In Progress",
  "For Validation",
  "Completed",
  "Returned",
];

const priorityFilters = ["All Priority", "Critical", "Urgent", "High", "Normal", "Low"];

const initialComplaints = [
  {
    id: "ADM-2026-0010",
    title: "Streetlight Not Working",
    category: "Streetlight Concerns",
    department: "City Engineering Office",
    geotaggedLocation: "Purok Hongkong, Barangay Libertad, Bogo City, Cebu",
    date: "May 1, 2026",
    time: "9:46 AM",
    status: "In Progress",
    priority: "High",
    citizen: "Juan Dela Cruz",
    contact: "0912 345 6789",
    moderator: "City Engineering Department Head",
    description:
      "A streetlight near the residential road has not been working for several nights, causing poor visibility for residents and passing vehicles.",
    uploadedPhotos: [
      "https://loremflickr.com/900/600/streetlight,night?lock=3010",
      "https://loremflickr.com/900/600/dark,street?lock=3011",
    ],
    validationPhoto: null,
    feedback: null,
  },
  {
    id: "ADM-2026-0009",
    title: "Clogged Drainage and Canals",
    category: "Drainage and Flooding Concerns",
    department: "City Engineering Office",
    geotaggedLocation:
      "Near main drainage canal, Barangay Libertad, Bogo City, Cebu",
    date: "May 1, 2026",
    time: "9:46 AM",
    status: "For Validation",
    priority: "Normal",
    citizen: "Maria Santos",
    contact: "0998 765 4321",
    moderator: "City Engineering Department Head",
    description:
      "Drainage canals are clogged with waste and mud, causing slow water flow and possible flooding during heavy rain.",
    uploadedPhotos: [
      "https://loremflickr.com/900/600/clogged,drainage?lock=3009",
      "https://loremflickr.com/900/600/flooded,street?lock=3008",
    ],
    validationPhoto: "https://loremflickr.com/900/600/clean,drainage?lock=3109",
    feedback:
      "The drainage has been cleaned, but the area still needs monitoring after heavy rain.",
  },
  {
    id: "ADM-2026-0008",
    title: "Damaged Road With Potholes",
    category: "Road and Infrastructure Concerns",
    department: "City Engineering Office",
    geotaggedLocation: "Dakit access road near tricycle route, Bogo City, Cebu",
    date: "May 3, 2026",
    time: "2:15 PM",
    status: "Pending",
    priority: "Urgent",
    citizen: "Ana Villanueva",
    contact: "0917 333 4455",
    moderator: "Unassigned",
    description:
      "Several potholes are visible on the road and may affect motorcycles, tricycles, and other vehicles passing through the area.",
    uploadedPhotos: [
      "https://loremflickr.com/900/600/pothole,road?lock=3007",
      "https://loremflickr.com/900/600/damaged,road?lock=3006",
    ],
    validationPhoto: null,
    feedback: null,
  },
  {
    id: "ADM-2026-0007",
    title: "Garbage Not Collected",
    category: "Waste and Environmental Concerns",
    department: "CENRO",
    geotaggedLocation: "Residential block, Barangay Gairan, Bogo City, Cebu",
    date: "May 4, 2026",
    time: "10:20 AM",
    status: "Completed",
    priority: "Low",
    citizen: "Carlo Reyes",
    contact: "0906 111 2222",
    moderator: "CENRO Department Head",
    description:
      "Garbage bags have remained uncollected near the residential block and may cause odor and pests.",
    uploadedPhotos: ["https://loremflickr.com/900/600/garbage,street?lock=3005"],
    validationPhoto: "https://loremflickr.com/900/600/clean,street?lock=3105",
    feedback: "The garbage was collected and the area is now clean.",
  },
  {
    id: "ADM-2026-0006",
    title: "Illegal Parking Near Corner",
    category: "Traffic and Road Safety Concerns",
    department: "BTMO",
    geotaggedLocation: "Corner road near public market, Bogo City, Cebu",
    date: "May 5, 2026",
    time: "4:40 PM",
    status: "Returned",
    priority: "High",
    citizen: "Liza Fernandez",
    contact: "0922 123 4567",
    moderator: "BTMO Department Head",
    description:
      "Vehicles are frequently parked near the corner, blocking visibility for drivers and pedestrians.",
    uploadedPhotos: [
      "https://loremflickr.com/900/600/illegal,parking?lock=3004",
    ],
    validationPhoto: null,
    feedback:
      "Returned for further checking because the submitted location needs confirmation.",
  },
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

function getConcernType(item) {
  return emergencyPriorityLevels.includes(item.priority)
    ? "Emergency"
    : "Non-Emergency";
}

function getConcernTypeStyle(type) {
  if (type === "Emergency") return { bg: "#FFF0F0", color: RED };
  return { bg: LIGHT_GREEN, color: GREEN };
}

function getStatusStyle(status) {
  if (status === "Pending") return { bg: "#E8EEFF", color: BLUE };
  if (status === "In Progress") return { bg: "#FFF2C2", color: "#A97700" };
  if (status === "For Validation") return { bg: LIGHT_GREEN, color: GREEN };
  if (status === "Completed") return { bg: "#DFF0DF", color: GREEN };
  if (status === "Returned") return { bg: "#FFF0F0", color: RED };

  return { bg: "#F1F1F1", color: MUTED };
}

function getPriorityStyle(priority) {
  if (priority === "Critical" || priority === "Urgent") return { bg: "#FFF0F0", color: RED };
  if (priority === "High") return { bg: "#FFF2E8", color: ORANGE };
  if (priority === "Normal") return { bg: LIGHT_GREEN, color: GREEN };
  if (priority === "Low") return { bg: "#F1F4F1", color: MUTED };

  return { bg: LIGHT_GREEN, color: GREEN };
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

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeStatusValue(status) {
  const clean = normalizeText(status);

  if (["pending", "assigned", "submitted", "new", "open"].includes(clean)) {
    return "Pending";
  }

  if (["in progress", "in_progress", "ongoing", "processing"].includes(clean)) {
    return "In Progress";
  }

  if (
    [
      "for validation",
      "for_validation",
      "validation",
      "validated",
      "pending validation",
      "waiting for validation",
    ].includes(clean)
  ) {
    return "For Validation";
  }

  if (["completed", "complete", "resolved", "closed"].includes(clean)) {
    return "Completed";
  }

  if (
    [
      "returned",
      "returned to department",
      "returned to department head",
      "for rework",
      "needs revision",
      "unsolved",
      "unresolved",
      "not solved",
    ].includes(clean)
  ) {
    return "Returned";
  }

  return status ? String(status).trim() : "Pending";
}

function normalizePriorityValue(priority, isEmergency = false) {
  const clean = normalizeText(priority);

  if (["critical", "urgent", "emergency"].includes(clean)) return "Critical";
  if (clean === "high") return "High";
  if (clean === "low") return "Low";
  if (["normal", "medium", "moderate"].includes(clean)) return "Normal";

  return isEmergency ? "Critical" : "Normal";
}

function normalizeConcernType(value, isEmergency = false, priority = "") {
  const clean = normalizeText(value);

  if (
    isEmergency ||
    clean === "emergency" ||
    (clean.includes("emergency") && !clean.includes("non")) ||
    ["critical", "urgent", "high"].includes(normalizeText(priority))
  ) {
    return "Emergency";
  }

  return "Non-Emergency";
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

function extractStoragePath(value, bucketName) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = `/storage/v1/object/public/${bucketName}/`;
  const signMarker = `/storage/v1/object/sign/${bucketName}/`;

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  if (!/^https?:\/\//i.test(text)) {
    return text.replace(new RegExp(`^${bucketName}/`), "").replace(/^\/+/, "");
  }

  return null;
}

async function createReadableStorageUrl(bucketName, value) {
  if (!value) return null;

  try {
    if (/^https?:\/\//i.test(String(value))) {
      return String(value);
    }

    const path = extractStoragePath(value, bucketName);

    if (!path) return null;

    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(path, 60 * 60);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(path);

    return publicData?.publicUrl || null;
  } catch (error) {
    console.log(`Resolve ${bucketName} storage URL error:`, error);
    return null;
  }
}

async function resolveComplaintPhotoUrls(row) {
  const rawUrls = normalizePhotoUrls(
    row?.photo_urls ||
      row?.photos ||
      row?.uploaded_photos ||
      row?.uploadedPhotos ||
      row?.image_urls
  );

  const resolvedUrls = [];

  for (const rawUrl of rawUrls) {
    const resolvedUrl = await createReadableStorageUrl("complaint-photos", rawUrl);

    if (resolvedUrl) {
      resolvedUrls.push(resolvedUrl);
    }
  }

  return resolvedUrls;
}

async function resolveValidationPhotoUrls(row) {
  const rawUrls = normalizePhotoUrls(
    row?.validation_photo_urls ||
      row?.validation_photos ||
      row?.validationPhotos ||
      row?.validation_photo ||
      row?.validationPhoto
  );

  const resolvedUrls = [];

  for (const rawUrl of rawUrls) {
    const resolvedUrl = await createReadableStorageUrl(
      "complaint-validation-photos",
      rawUrl
    );

    if (resolvedUrl) {
      resolvedUrls.push(resolvedUrl);
      continue;
    }

    const fallbackUrl = await createReadableStorageUrl("complaint-photos", rawUrl);

    if (fallbackUrl) {
      resolvedUrls.push(fallbackUrl);
    }
  }

  return resolvedUrls;
}

function buildProfileMap(profiles = []) {
  return (profiles || []).reduce((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  }, {});
}

async function mapComplaintRow(row, profileMap = {}) {
  const createdAt = row.created_at || row.submitted_at || new Date().toISOString();
  const citizenProfile = profileMap[row.citizen_id] || {};
  const uploadedPhotos = await resolveComplaintPhotoUrls(row);
  const validationPhotos = await resolveValidationPhotoUrls(row);
  const priority = normalizePriorityValue(row.priority, row.is_emergency);
  const status = normalizeStatusValue(row.status);
  const concernType = normalizeConcernType(row.complaint_type, row.is_emergency, priority);

  return {
    id: row.short_id || row.id,
    rawId: row.id,
    citizenId: row.citizen_id,
    title: row.title || "Untitled Complaint",
    category: row.category || row.concern_category || "Unclassified",
    department:
      row.assigned_office ||
      row.assignedOffice ||
      row.department ||
      "Unassigned",
    geotaggedLocation:
      row.location_text ||
      row.geotagged_location ||
      row.location ||
      row.barangay ||
      "Pinned location not available",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    createdAt,
    status,
    priority,
    concernType,
    citizen:
      row.citizen_name ||
      row.full_name ||
      citizenProfile.full_name ||
      "Citizen",
    contact:
      row.contact_number ||
      citizenProfile.contact_number ||
      "No contact number",
    moderator:
      row.moderator_name ||
      row.assigned_moderator ||
      row.moderator ||
      "Assigned department head",
    description: row.description || "No description provided.",
    uploadedPhotos,
    validationPhoto: validationPhotos[0] || row.validation_photo_url || null,
    validationPhotos,
    feedback:
      row.validation_feedback ||
      row.citizen_feedback ||
      row.feedback ||
      row.validation_notes ||
      null,
  };
}

export default function AdminComplaints() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  const [complaints, setComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [selectedConcernType, setSelectedConcernType] =
    useState("All Concerns");
  const [selectedCategory, setSelectedCategory] = useState("All Category");
  const [selectedStatus, setSelectedStatus] = useState("All Status");
  const [selectedPriority, setSelectedPriority] = useState("All Priority");

  const [concernTypeDropdownVisible, setConcernTypeDropdownVisible] =
    useState(false);
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);
  const [priorityDropdownVisible, setPriorityDropdownVisible] = useState(false);

  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

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
        console.log("Admin complaints load error:", error);
        Alert.alert("Load Failed", error.message);
        setComplaints([]);
        return;
      }

      const citizenIds = Array.from(
        new Set((data || []).map((row) => row.citizen_id).filter(Boolean))
      );

      let profileMap = {};

      if (citizenIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, email, full_name, contact_number, avatar_url")
          .in("id", citizenIds);

        if (!profilesError) {
          profileMap = buildProfileMap(profilesData || []);
        } else {
          console.log("Admin complaints citizen profiles load error:", profilesError);
        }
      }

      const mappedComplaints = await Promise.all(
        (data || []).map((row) => mapComplaintRow(row, profileMap))
      );

      setComplaints(mappedComplaints);
    } catch (error) {
      console.log("Admin complaints load catch error:", error);
      Alert.alert("Load Failed", "Unable to load complaints.");
      setComplaints([]);
    } finally {
      if (showLoader) {
        setLoadingComplaints(false);
      }
    }
  }, []);

  useEffect(() => {
    loadAllComplaints(true);
  }, [loadAllComplaints]);

  useFocusEffect(
    useCallback(() => {
      loadAllComplaints(false);
    }, [loadAllComplaints])
  );

  useEffect(() => {
    const channel = supabase
      .channel(`admin-complaints-all-${Date.now()}`)
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
        console.log("Admin complaints realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllComplaints]);

  const filteredComplaints = useMemo(() => {
    const filtered = complaints.filter((item) => {
      const concernType = item.concernType || getConcernType(item);

      const concernTypeMatch =
        selectedConcernType === "All Concerns" ||
        concernType === selectedConcernType;

      const categoryMatch =
        selectedCategory === "All Category" || item.category === selectedCategory;

      const statusMatch =
        selectedStatus === "All Status" || item.status === selectedStatus;

      const priorityMatch =
        selectedPriority === "All Priority" || item.priority === selectedPriority;

      return concernTypeMatch && categoryMatch && statusMatch && priorityMatch;
    });

    return [...filtered].sort(
      (a, b) =>
        parseComplaintDateTime(b.date, b.time) -
        parseComplaintDateTime(a.date, a.time)
    );
  }, [
    complaints,
    selectedConcernType,
    selectedCategory,
    selectedStatus,
    selectedPriority,
  ]);

  const openDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setDetailsVisible(true);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  const closeDetails = () => {
    setSelectedComplaint(null);
    setDetailsVisible(false);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  const openPhotoViewer = (uri) => {
    if (!uri) return;
    setSelectedPhoto(uri);
    setPhotoViewerVisible(true);
  };

  const closePhotoViewer = () => {
    setPhotoViewerVisible(false);

    setTimeout(() => {
      setSelectedPhoto(null);
    }, 160);
  };

  const markAsComplete = async () => {
    if (!selectedComplaint) return;

    if (selectedComplaint.status !== "For Validation") {
      Alert.alert(
        "Action unavailable",
        "Only complaints under For Validation can be marked as completed."
      );
      return;
    }

    const complaintId = selectedComplaint.rawId || selectedComplaint.id;
    const oldStatus = selectedComplaint.status;

    const { error } = await supabase
      .from("complaints")
      .update({ status: "Completed" })
      .eq("id", complaintId);

    if (error) {
      Alert.alert("Update Failed", error.message);
      return;
    }

    if (selectedComplaint.citizenId) {
      await createCitizenNotificationAndPush({
        citizenId: selectedComplaint.citizenId,
        complaintId,
        shortId: selectedComplaint.id,
        type: "status",
        title: "Complaint Completed",
        message: `Your complaint #${selectedComplaint.id} has been marked as completed by the department head.`,
        status: "Completed",
        metadata: {
          old_status: oldStatus,
          new_status: "Completed",
          assigned_office: selectedComplaint.department,
          title: selectedComplaint.title,
          category: selectedComplaint.category,
        },
      });
    }

    setComplaints((prev) =>
      prev.map((item) =>
        (item.rawId || item.id) === complaintId
          ? { ...item, status: "Completed" }
          : item
      )
    );

    setSelectedComplaint((prev) =>
      prev ? { ...prev, status: "Completed" } : prev
    );

    Alert.alert("Complaint Completed", "The complaint has been marked complete.");
    loadAllComplaints(false);
  };

  const returnForReview = async () => {
    if (!selectedComplaint) return;

    if (selectedComplaint.status !== "For Validation") {
      Alert.alert(
        "Action unavailable",
        "Only complaints under For Validation can be returned for review."
      );
      return;
    }

    const complaintId = selectedComplaint.rawId || selectedComplaint.id;
    const oldStatus = selectedComplaint.status;

    const { error } = await supabase
      .from("complaints")
      .update({ status: "Returned" })
      .eq("id", complaintId);

    if (error) {
      Alert.alert("Update Failed", error.message);
      return;
    }

    if (selectedComplaint.citizenId) {
      await createCitizenNotificationAndPush({
        citizenId: selectedComplaint.citizenId,
        complaintId,
        shortId: selectedComplaint.id,
        type: "status",
        title: "Complaint Returned for Review",
        message: `Your complaint #${selectedComplaint.id} was returned for review by the department head.`,
        status: "Returned",
        metadata: {
          old_status: oldStatus,
          new_status: "Returned",
          assigned_office: selectedComplaint.department,
          title: selectedComplaint.title,
          category: selectedComplaint.category,
        },
      });
    }

    setComplaints((prev) =>
      prev.map((item) =>
        (item.rawId || item.id) === complaintId
          ? { ...item, status: "Returned" }
          : item
      )
    );

    setSelectedComplaint((prev) =>
      prev ? { ...prev, status: "Returned" } : prev
    );

    Alert.alert("Returned for Review", "The complaint has been returned.");
    loadAllComplaints(false);
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
          <View style={styles.headerContainer}>
            <Text style={styles.headerTitle}>Overall Complaints</Text>
          </View>

          <View style={styles.filterGrid}>
            <View style={styles.filterHalfRow}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.filterPillHalf}
                onPress={() => setConcernTypeDropdownVisible(true)}
              >
                <Text style={styles.filterText} numberOfLines={1}>
                  {selectedConcernType}
                </Text>
                <Ionicons name="chevron-down" size={14} color={MUTED} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.filterPillHalf}
                onPress={() => setCategoryDropdownVisible(true)}
              >
                <Text style={styles.filterText} numberOfLines={1}>
                  {selectedCategory}
                </Text>
                <Ionicons name="chevron-down" size={14} color={MUTED} />
              </TouchableOpacity>
            </View>

            <View style={styles.filterHalfRow}>
              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.filterPillHalf}
                onPress={() => setStatusDropdownVisible(true)}
              >
                <Text style={styles.filterText} numberOfLines={1}>
                  {selectedStatus}
                </Text>
                <Ionicons name="chevron-down" size={14} color={MUTED} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={styles.filterPillHalf}
                onPress={() => setPriorityDropdownVisible(true)}
              >
                <Text style={styles.filterText} numberOfLines={1}>
                  {selectedPriority}
                </Text>
                <Ionicons name="chevron-down" size={14} color={MUTED} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.complaintsList}>
            {loadingComplaints && complaints.length === 0 ? (
              <View style={styles.emptyCard}>
                <ActivityIndicator size="large" color={GREEN} />
                <Text style={styles.emptyTitle}>Loading complaints...</Text>
                <Text style={styles.emptyText}>
                  Fetching all submitted complaints across departments.
                </Text>
              </View>
            ) : filteredComplaints.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={30} color={MUTED} />
                <Text style={styles.emptyTitle}>No complaints found</Text>
                <Text style={styles.emptyText}>
                  No submitted complaints match the selected filters.
                </Text>
              </View>
            ) : (
              filteredComplaints.map((item) => {
                const statusStyle = getStatusStyle(item.status);
                const priorityStyle = getPriorityStyle(item.priority);
                const concernType = item.concernType || getConcernType(item);
                const concernStyle = getConcernTypeStyle(concernType);

                return (
                  <TouchableOpacity
                    key={item.rawId || item.id}
                    activeOpacity={0.78}
                    style={styles.complaintCard}
                    onPress={() => openDetails(item)}
                  >
                    <View style={styles.complaintHeaderRow}>
                      <View style={styles.complaintTitleBox}>
                        <Text style={styles.complaintTitle} numberOfLines={1}>
                          {item.title}
                        </Text>

                        <Text style={styles.complaintLocation} numberOfLines={2}>
                          {item.geotaggedLocation}
                        </Text>
                      </View>

                      <Feather name="chevron-right" size={20} color={MUTED} />
                    </View>

                    <View style={styles.departmentRow}>
                      <MaterialCommunityIcons
                        name="office-building-outline"
                        size={14}
                        color={GREEN}
                      />
                      <Text style={styles.departmentText} numberOfLines={1}>
                        {item.department}
                      </Text>
                    </View>

                    <View style={styles.metaAndBadgeRow}>
                      <View style={styles.dateTimeColumn}>
                        <View style={styles.metaItem}>
                          <Feather name="calendar" size={12} color={MUTED} />
                          <Text style={styles.metaText}>{item.date}</Text>
                        </View>

                        <View style={styles.metaItem}>
                          <Feather name="clock" size={12} color={MUTED} />
                          <Text style={styles.metaText}>{item.time}</Text>
                        </View>
                      </View>

                      <View style={styles.badgeColumn}>
                        <View
                          style={[
                            styles.concernBadge,
                            { backgroundColor: concernStyle.bg },
                          ]}
                        >
                          <Text
                            style={[
                              styles.concernBadgeText,
                              { color: concernStyle.color },
                            ]}
                            numberOfLines={1}
                          >
                            {concernType}
                          </Text>
                        </View>

                        <View style={styles.badgeRowBeside}>
                          <View
                            style={[
                              styles.statusBadge,
                              { backgroundColor: statusStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusBadgeText,
                                { color: statusStyle.color },
                              ]}
                              numberOfLines={1}
                            >
                              {item.status}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.priorityBadge,
                              { backgroundColor: priorityStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.priorityBadgeText,
                                { color: priorityStyle.color },
                              ]}
                              numberOfLines={1}
                            >
                              {item.priority}
                            </Text>
                          </View>
                        </View>
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

        <DropdownModal
          visible={concernTypeDropdownVisible}
          title="Select Concern Type"
          options={concernTypeFilters}
          selectedValue={selectedConcernType}
          onClose={() => setConcernTypeDropdownVisible(false)}
          onSelect={(item) => {
            setSelectedConcernType(item);
            setConcernTypeDropdownVisible(false);
          }}
        />

        <DropdownModal
          visible={categoryDropdownVisible}
          title="Select Category"
          options={categoryFilters}
          selectedValue={selectedCategory}
          onClose={() => setCategoryDropdownVisible(false)}
          onSelect={(item) => {
            setSelectedCategory(item);
            setCategoryDropdownVisible(false);
          }}
        />

        <DropdownModal
          visible={statusDropdownVisible}
          title="Select Status"
          options={statusFilters}
          selectedValue={selectedStatus}
          onClose={() => setStatusDropdownVisible(false)}
          onSelect={(item) => {
            setSelectedStatus(item);
            setStatusDropdownVisible(false);
          }}
        />

        <DropdownModal
          visible={priorityDropdownVisible}
          title="Select Priority"
          options={priorityFilters}
          selectedValue={selectedPriority}
          onClose={() => setPriorityDropdownVisible(false)}
          onSelect={(item) => {
            setSelectedPriority(item);
            setPriorityDropdownVisible(false);
          }}
        />

        <Modal
          visible={detailsVisible}
          transparent
          animationType="slide"
          onRequestClose={closeDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Complaint Details</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={closeDetails}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              {selectedComplaint && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalComplaintTitle}>
                    {selectedComplaint.title}
                  </Text>

                  <Text style={styles.modalComplaintId}>
                    {selectedComplaint.id}
                  </Text>

                  <View style={styles.importantInfoCard}>
                    <ImportantInfoRow
                      label="Citizen"
                      value={selectedComplaint.citizen}
                    />
                    <ImportantInfoRow
                      label="Contact Number"
                      value={selectedComplaint.contact}
                    />
                    <ImportantInfoRow
                      label="Pinned Location"
                      value={selectedComplaint.geotaggedLocation}
                      last
                    />
                  </View>

                  <View style={styles.descriptionBox}>
                    <Text style={styles.infoLabel}>Description</Text>
                    <Text style={styles.descriptionText}>
                      {selectedComplaint.description}
                    </Text>
                  </View>

                  <View style={styles.modalInfoCard}>
                    <Text style={styles.detailsSectionTitle}>
                      Complaint Information
                    </Text>

                    <InfoRow
                      label="Concern Type"
                      value={getConcernType(selectedComplaint)}
                    />
                    <InfoRow label="Category" value={selectedComplaint.category} />
                    <InfoRow
                      label="Department"
                      value={selectedComplaint.department}
                    />
                    <InfoRow
                      label="Assigned Department Head"
                      value={selectedComplaint.moderator}
                    />
                    <InfoRow label="Priority" value={selectedComplaint.priority} />
                    <InfoRow label="Status" value={selectedComplaint.status} />
                    <InfoRow
                      label="Date Submitted"
                      value={selectedComplaint.date}
                    />
                    <InfoRow
                      label="Time Submitted"
                      value={selectedComplaint.time}
                      last
                    />
                  </View>

                  <View style={styles.photoSection}>
                    <Text style={styles.detailsSectionTitle}>Photo Evidence</Text>

                    {selectedComplaint.uploadedPhotos?.length > 0 ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.evidencePhotoRow}
                      >
                        {selectedComplaint.uploadedPhotos.map((photo, index) => (
                          <TouchableOpacity
                            key={`${photo}-${index}`}
                            activeOpacity={0.8}
                            onPress={() => openPhotoViewer(photo)}
                          >
                            <Image
                              source={{ uri: photo }}
                              style={styles.evidencePhoto}
                            />
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : (
                      <View style={styles.noPhotoBox}>
                        <Ionicons name="image-outline" size={34} color={MUTED} />
                        <Text style={styles.noPhotoText}>
                          No photo evidence available
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.validationCard}>
                    <Text style={styles.detailsSectionTitle}>
                      Citizen Validation
                    </Text>

                    {selectedComplaint.feedback ? (
                      <>
                        <Text style={styles.feedbackText}>
                          {selectedComplaint.feedback}
                        </Text>

                        {selectedComplaint.validationPhoto && (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() =>
                              openPhotoViewer(selectedComplaint.validationPhoto)
                            }
                          >
                            <Image
                              source={{ uri: selectedComplaint.validationPhoto }}
                              style={styles.validationPhoto}
                            />
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <Text style={styles.noValidationText}>
                        No citizen validation submitted yet.
                      </Text>
                    )}
                  </View>

                  {selectedComplaint.status === "For Validation" && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.completeButton}
                        onPress={markAsComplete}
                      >
                        <MaterialCommunityIcons
                          name="check-circle-outline"
                          size={16}
                          color={WHITE}
                        />
                        <Text style={styles.completeButtonText}>
                          Mark Complete
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.returnButton}
                        onPress={returnForReview}
                      >
                        <MaterialCommunityIcons
                          name="reply-outline"
                          size={16}
                          color={GREEN}
                        />
                        <Text style={styles.returnButtonText}>Return</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>

            {photoViewerVisible && selectedPhoto && (
              <TouchableOpacity
                activeOpacity={1}
                style={styles.photoViewerOverlay}
                onPress={closePhotoViewer}
              >
                <Image
                  pointerEvents="none"
                  source={{ uri: selectedPhoto }}
                  style={styles.fullscreenPhoto}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            )}
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function DropdownModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.centerModalOverlay}>
        <View style={styles.dropdownBox}>
          <View style={styles.dropdownHeader}>
            <Text style={styles.dropdownTitle}>{title}</Text>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Feather name="x" size={21} color={TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((item) => (
              <TouchableOpacity
                key={item}
                activeOpacity={0.75}
                style={[
                  styles.dropdownOption,
                  selectedValue === item && styles.dropdownOptionActive,
                ]}
                onPress={() => onSelect(item)}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedValue === item && styles.dropdownOptionTextActive,
                  ]}
                >
                  {item}
                </Text>

                {selectedValue === item && (
                  <Feather name="check" size={18} color={GREEN} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ImportantInfoRow({ label, value, last }) {
  return (
    <View style={[styles.importantInfoRow, last && styles.infoRowLast]}>
      <Text style={[styles.infoLabel, styles.importantInfoLabel]}>{label}</Text>
      <Text style={[styles.infoValue, styles.importantInfoValue]}>{value}</Text>
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

  headerContainer: {
    marginBottom: 12,
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  filterGrid: {
    gap: 8,
    marginBottom: 14,
  },

  filterPillFull: {
    width: "100%",
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },

  filterHalfRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  filterPillHalf: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },

  filterText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: TEXT,
  },

  complaintsList: {
    gap: 10,
  },

  complaintCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  complaintHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  complaintTitleBox: {
    flex: 1,
    paddingRight: 8,
  },

  complaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: TEXT,
  },

  complaintLocation: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    lineHeight: 15,
    marginTop: 3,
  },

  departmentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  departmentText: {
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10.6,
    color: GREEN,
    marginLeft: 6,
  },

  metaAndBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 9,
  },

  dateTimeColumn: {
    flex: 1,
    gap: 5,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },

  metaText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: TEXT,
    marginLeft: 6,
  },

  badgeColumn: {
    alignItems: "flex-end",
    gap: 5,
  },

  badgeRowBeside: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 178,
  },

  concernBadge: {
    minHeight: 23,
    borderRadius: 12,
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  concernBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.2,
  },

  statusBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.2,
  },

  priorityBadge: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  priorityBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.2,
  },

  emptyCard: {
    minHeight: 130,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: TEXT,
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
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

  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  dropdownBox: {
    width: "100%",
    maxHeight: "72%",
    borderRadius: 22,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  dropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  dropdownTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: GREEN,
  },

  dropdownOption: {
    minHeight: 46,
    borderRadius: 13,
    paddingHorizontal: 12,
    marginBottom: 7,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownOptionActive: {
    backgroundColor: LIGHT_GREEN,
    borderColor: "#BFE3B5",
  },

  dropdownOptionText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: TEXT,
    paddingRight: 8,
  },

  dropdownOptionTextActive: {
    fontFamily: "Poppins_700Bold",
    color: GREEN,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "90%",
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

  modalComplaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: TEXT,
  },

  modalComplaintId: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
    marginBottom: 12,
  },

  importantInfoCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 12,
  },

  importantInfoRow: {
    marginBottom: 11,
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

  importantInfoLabel: {
    fontSize: 12.5,
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 16,
    marginTop: 1,
  },

  importantInfoValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13.2,
    lineHeight: 18,
    color: TEXT,
  },

  descriptionBox: {
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 14,
  },

  descriptionText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 3,
  },

  detailsSectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: GREEN,
    marginBottom: 8,
  },

  modalInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
  },

  photoSection: {
    marginBottom: 15,
  },

  evidencePhotoRow: {
    gap: 10,
    paddingRight: 10,
  },

  evidencePhoto: {
    width: Math.min(185, SCREEN_WIDTH * 0.48),
    height: 125,
    borderRadius: 13,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },

  noPhotoBox: {
    height: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  noPhotoText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    marginTop: 3,
  },

  validationCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
  },

  feedbackText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginBottom: 9,
  },

  noValidationText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11.5,
    color: MUTED,
  },

  validationPhoto: {
    width: "100%",
    height: 150,
    borderRadius: 13,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },

  completeButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  completeButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: WHITE,
  },

  returnButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },

  returnButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: GREEN,
  },

  photoViewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 40,
    elevation: 40,
  },

  fullscreenPhoto: {
    width: "100%",
    height: "100%",
  },
});
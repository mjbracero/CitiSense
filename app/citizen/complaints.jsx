import {
  Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import {
  useFocusEffect,
  useLocalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import ComplaintsLoadMoreFooter from "../../components/ComplaintsLoadMoreFooter";
import { ComplaintListSkeleton, PageSkeleton } from "../../components/skeletons";
import FullscreenPhotoViewer from "../../components/FullscreenPhotoViewer";
import EvidencePrivacyEditor from "../../components/EvidencePrivacyEditor";
import Skeleton from "../../components/Skeleton";
import {
  getProfileDisplayName,
  notifyAdminsCitizenValidated,
} from "../../lib/adminNotificationService";
import { notifyCitizenAiValidationResult } from "../../lib/citizenNotificationService";
import { requestCitizenValidationReminders } from "../../lib/citizenValidationReminderService";
import { writeAuditLog } from "../../lib/auditLogService";
import {
  buildResolutionValidationDbPayload,
  validateResolutionWithGemini,
} from "../../lib/geminiResolutionValidation";
import {
  applyComplaintOffsetFilters,
  applyOffsetPagination,
  COMPLAINTS_PAGE_SIZE,
  isNearContentBottom,
  mergeComplaintPages,
  waitOffsetPageDelay,
} from "../../lib/complaintPagination";
import {
  canCitizenSubmitValidation,
  getLatestFeedbackStatusByComplaintIds,
  insertComplaintFeedback,
  isValidationResubmit,
  updateComplaintFeedbackAi,
} from "../../lib/complaintFeedbackService";
import {
  calculatePriorityFromKeywords,
  resolveComplaintRouting,
} from "../../lib/complaintCategories";
import {
  markMediaPickerSession,
  scheduleClearMediaPickerSession,
} from "../../lib/navigationPersistence";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import {
  resolveComplaintEvidencePhotoUrls,
  resolveComplaintValidationPhotoUrls,
  resolveReadableComplaintPhotoUrl,
} from "../../lib/complaintPhotoCache";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

// ===== [CITIZEN COMPLAINTS] Constants: colors, limits, storage & cache keys =====

const H_PADDING = 20;
const MAX_VALIDATION_PHOTOS = 3;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const COMPLAINT_PHOTOS_BUCKET = "complaint-photos";
const CITIZEN_COMPLAINTS_LAST_FILTER_KEY = "citizen.complaints.lastFilter";

function citizenComplaintsCacheKey(filter) {
  return `citizen.complaints:${filter || "All"}`;
}

// ===== [CITIZEN COMPLAINTS] Bottom tab config =====
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

// ===== [CITIZEN COMPLAINTS] Status filters =====
const filters = [
  "All",
  "Pending",
  "In Progress",
  "For Validation",
  "Returned",
  "Completed",
];

const FILTER_OPTIONS = [...filters, "All Emergency", "All Non-Emergency"];
const FOR_VALIDATION_STATUSES = ["For Validation"];

function resolveComplaintsFilter(params, lastFilter) {
  const requested = params?.filter ? String(params.filter) : "";

  if (FILTER_OPTIONS.includes(requested)) return requested;

  return lastFilter || "All";
}

// ===== [CITIZEN COMPLAINTS] Helpers: status sort rank & concern type =====
function getStatusSortRank(status) {
  if (status === "Returned") return 0;
  if (status === "For Validation") return 1;
  return 2;
}

function normalizeConcernType(value, isEmergency = false, priority = "Normal") {
  const cleanValue = String(value || "").trim().toLowerCase();

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

// ===== [CITIZEN COMPLAINTS] Photo URL resolvers =====
async function createReadableComplaintPhotoUrl(value) {
  return resolveReadableComplaintPhotoUrl(value);
}

async function resolveComplaintPhotoUrls(row) {
  return resolveComplaintEvidencePhotoUrls(row);
}

async function resolveValidationPhotoUrls(row) {
  return resolveComplaintValidationPhotoUrls(row);
}

// ===== [CITIZEN COMPLAINTS] Date/time formatting & status timeline =====
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

function buildTimeline(status, createdAt, assignedOffice) {
  const submittedTime = `${formatDbDate(createdAt)} • ${formatDbTime(
    createdAt
  )}`;

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

// ===== [CITIZEN COMPLAINTS] Map DB complaint row -> UI complaint object =====
function getDisplayComplaintId(row) {
  if (row.short_id) return String(row.short_id);
  if (row.complaint_short_id) return String(row.complaint_short_id);
  if (row.id) return String(row.id).slice(0, 8).toUpperCase();

  return "N/A";
}

async function mapDatabaseComplaint(row) {
  const createdAt =
    row.created_at || row.submitted_at || row.submitted_date_time || new Date().toISOString();

  const { category, assignedOffice } = resolveComplaintRouting(
    row.title,
    row.description,
    row.category || row.concern_category,
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
  const firstPhoto = photoUrls[0] || PHOTO_PLACEHOLDER;
  const validationPhotoUrls = await resolveValidationPhotoUrls(row);

  return {
    id: row.id,
    shortId: getDisplayComplaintId(row),
    title: row.title || "Untitled Complaint",
    category,
    concernType,
    location: row.location_text || row.location || "Location not available",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    submittedAt: `${formatDbDate(createdAt)} • ${formatDbTime(createdAt)}`,
    createdAt,
    assignedOffice,
    priority,
    status: row.status || "Pending",
    latestFeedbackStatus: row.latest_feedback_status || null,
    validationSubmitted: getValidationSubmitted(row),
    validationResult: getValidationResult(row),
    validationFeedback: getValidationFeedback(row),
    validationPhotoUrls,
    description: row.description || "No description provided.",
    photo: firstPhoto,
    photoUrls,
    timeline: buildTimeline(row.status || "Pending", createdAt, assignedOffice),
  };
}

// ===== [CITIZEN COMPLAINTS] Badge styles: status, priority, concern type =====
function getStatusStyle(status) {
  if (status === "Pending") {
    return {
      bg: "rgba(232, 238, 255, 1)",
      color: "rgba(49, 90, 154, 1)",
      icon: "clock-outline",
    };
  }

  if (status === "In Progress") {
    return {
      bg: "rgba(255, 248, 214, 1)",
      color: "rgba(201, 160, 0, 1)",
      icon: "progress-wrench",
    };
  }

  if (status === "For Validation") {
    return {
      bg: "rgba(243, 234, 255, 1)",
      color: "rgba(122, 62, 168, 1)",
      icon: "clipboard-check-outline",
    };
  }

  if (status === "Completed") {
    return {
      bg: "rgba(223, 240, 223, 1)",
      color: "rgba(8, 122, 13, 1)",
      icon: "check-circle-outline",
    };
  }

  if (status === "Returned") {
    return {
      bg: "rgba(255, 240, 240, 1)",
      color: "rgba(215, 25, 32, 1)",
      icon: "arrow-u-left-top",
    };
  }

  return {
    bg: "rgba(241, 241, 241, 1)",
    color: "rgba(111, 119, 111, 1)",
    icon: "file-document-outline",
  };
}

function getPriorityStyle(priority) {
  if (priority === "High") {
    return {
      bg: "rgba(255, 242, 232, 1)",
      color: "rgba(244, 162, 76, 1)",
    };
  }

  if (priority === "Critical" || priority === "Urgent") {
    return {
      bg: "rgba(255, 240, 240, 1)",
      color: "rgba(215, 25, 32, 1)",
    };
  }

  if (priority === "Low") {
    return {
      bg: "rgba(241, 244, 241, 1)",
      color: "rgba(111, 119, 111, 1)",
    };
  }

  return {
    bg: "rgba(234, 246, 228, 1)",
    color: "rgba(8, 122, 13, 1)",
  };
}

function getConcernStyle(concernType) {
  if (concernType === "Emergency") {
    return {
      bg: "rgba(255, 240, 240, 1)",
      color: "rgba(215, 25, 32, 1)",
      icon: "alert-triangle",
    };
  }

  return {
    bg: "rgba(234, 246, 228, 1)",
    color: "rgba(8, 122, 13, 1)",
    icon: "check-circle",
  };
}

// ===== [CITIZEN COMPLAINTS] Validation photo helpers: format check, extension, resize =====
function isValidImageFormat(asset) {
  const mimeType = asset.mimeType?.toLowerCase() || "";
  const uri = asset.uri?.toLowerCase() || "";
  const fileName = asset.fileName?.toLowerCase() || "";

  const validMime =
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/jpg" ||
    mimeType === "image/heic" ||
    mimeType === "image/heif" ||
    mimeType.startsWith("image/");

  const validUri =
    uri.endsWith(".jpg") ||
    uri.endsWith(".jpeg") ||
    uri.endsWith(".png") ||
    uri.endsWith(".heic") ||
    uri.endsWith(".heif");

  const validFileName =
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png") ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");

  // Android content:// URIs often omit mime/extension.
  if (
    !mimeType &&
    (uri.startsWith("content://") ||
      uri.startsWith("file://") ||
      uri.startsWith("ph://"))
  ) {
    return true;
  }

  return validMime || validUri || validFileName;
}

function getValidationPhotoExtension(uri = "", mimeType = "") {
  const cleanMime = mimeType.toLowerCase();

  if (cleanMime.includes("png")) return "png";
  if (cleanMime.includes("heic")) return "heic";
  if (cleanMime.includes("heif")) return "heif";

  const extension = uri.split(".").pop()?.toLowerCase();

  if (["jpg", "jpeg", "png", "heic", "heif"].includes(extension)) {
    return extension;
  }

  return "jpg";
}

function getValidationPhotoContentType(extension) {
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
}

async function prepareValidationPhotoAsset(asset) {
  if (!asset?.uri) {
    return null;
  }

  try {
    const manipulatedPhoto = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 960 } }],
      {
        compress: 0.65,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      id: `${manipulatedPhoto.uri}-${Date.now()}-${Math.random()}`,
      uri: manipulatedPhoto.uri,
      fileName: asset.fileName || "Validation photo",
      fileSize: asset.fileSize || 0,
      mimeType: "image/jpeg",
    };
  } catch (error) {
    console.log("Prepare validation photo error:", error);
    return null;
  }
}

// ===== [CITIZEN COMPLAINTS] Validation fields read from DB row =====
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

function getValidationResult(row) {
  return (
    row.citizen_validation_answer ||
    row.citizen_validation_result ||
    row.validation_answer ||
    row.validation_result ||
    null
  );
}

function getValidationFeedback(row) {
  return (
    row.citizen_validation_feedback ||
    row.validation_feedback ||
    row.citizen_feedback ||
    ""
  );
}

// ===== [CITIZEN COMPLAINTS] Validation photo upload (read file + Supabase storage) =====
function getValidationFileExtension(photo) {
  const name = String(photo?.fileName || photo?.uri || "").toLowerCase();
  const mimeType = String(photo?.mimeType || "").toLowerCase();

  if (mimeType.includes("png") || name.endsWith(".png")) return "png";
  if (mimeType.includes("heic") || name.endsWith(".heic")) return "heic";
  if (mimeType.includes("heif") || name.endsWith(".heif")) return "heif";
  if (name.endsWith(".jpeg")) return "jpeg";

  return "jpg";
}

async function readValidationPhotoForUpload(photo) {
  if (!photo?.uri) {
    throw new Error("Selected photo has no file URI.");
  }

  const fileInfo = await FileSystem.getInfoAsync(photo.uri, {
    size: true,
  });

  if (!fileInfo.exists) {
    throw new Error("The selected photo could not be prepared for upload.");
  }

  if (!fileInfo.size) {
    throw new Error("The selected photo appears to be empty.");
  }

  if (fileInfo.size > MAX_PHOTO_SIZE) {
    throw new Error("The selected photo is too large. Maximum size is 10MB.");
  }

  const base64 = await FileSystem.readAsStringAsync(photo.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("The selected photo could not be read for upload.");
  }

  const arrayBuffer = decode(base64);

  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("The selected photo could not be read for upload.");
  }

  return {
    arrayBuffer,
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

async function uploadValidationPhotos(complaintId, photos = []) {
  const uploadedPaths = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    let preparedPhoto = null;

    try {
      preparedPhoto = await readValidationPhotoForUpload(photo);
      const storagePath = `${complaintId}/validation-${
        index + 1
      }-${Date.now()}.jpg`;

      const { error } = await supabase.storage
        .from(COMPLAINT_PHOTOS_BUCKET)
        .upload(storagePath, preparedPhoto.arrayBuffer, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (error) {
        throw error;
      }

      uploadedPaths.push(storagePath);
    } finally {
      if (preparedPhoto) {
        preparedPhoto.arrayBuffer = null;
      }
    }
  }

  return uploadedPaths;
}

// ===== [CITIZEN COMPLAINTS] Sort helper: parse submittedAt string =====
function parseSubmittedAt(submittedAt) {
  const [datePart, timePart = "12:00 AM"] = submittedAt
    .split("•")
    .map((part) => part.trim());

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

  const dateMatch = datePart.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

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

// ===== [CITIZEN COMPLAINTS] Screen component =====
export default function CitizenComplaints() {
  // --- [CITIZEN COMPLAINTS] Route params, target complaint & cache seed ---
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();

  const targetComplaintId = params?.complaintId
    ? String(params.complaintId)
    : null;
  const shouldOpenValidation = params?.openValidation === "true";

  const lastComplaintsFilter =
    getPageCache(CITIZEN_COMPLAINTS_LAST_FILTER_KEY)?.filter || "All";
  const cachedComplaintsPage = getPageCache(
    citizenComplaintsCacheKey(
      resolveComplaintsFilter(params, lastComplaintsFilter)
    )
  );

  // --- [CITIZEN COMPLAINTS] State: list, counts, filter, modals, validation photos ---
  const [complaintsData, setComplaintsData] = useState(
    cachedComplaintsPage?.complaints ?? []
  );
  const [complaintsTotal, setComplaintsTotal] = useState(
    cachedComplaintsPage?.total ?? 0
  );
  const [submittedCount, setSubmittedCount] = useState(
    cachedComplaintsPage?.submittedCount ?? 0
  );
  const [emergencyCount, setEmergencyCount] = useState(
    cachedComplaintsPage?.emergencyCount ?? 0
  );
  const [nonEmergencyCount, setNonEmergencyCount] = useState(
    cachedComplaintsPage?.nonEmergencyCount ?? 0
  );
  const [loadingComplaints, setLoadingComplaints] = useState(
    !cachedComplaintsPage
  );
  const [loadingMoreComplaints, setLoadingMoreComplaints] = useState(false);
  const [hasMoreComplaints, setHasMoreComplaints] = useState(
    cachedComplaintsPage?.hasMore !== false
  );
  const [currentUserId, setCurrentUserId] = useState(
    cachedComplaintsPage?.currentUserId ?? null
  );
  const [autoOpenedComplaintId, setAutoOpenedComplaintId] = useState(null);
  const [activeFilter, setActiveFilter] = useState(
    resolveComplaintsFilter(params, lastComplaintsFilter)
  );
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [validationVisible, setValidationVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [validationPhotos, setValidationPhotos] = useState([]);
  const [validationAnswer, setValidationAnswer] = useState(null);
  const [submittingValidation, setSubmittingValidation] = useState(false);
  const [privacyQueue, setPrivacyQueue] = useState([]);
  const [privacyPhoto, setPrivacyPhoto] = useState(null);
  const [privacyReplaceId, setPrivacyReplaceId] = useState(null);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  // --- [CITIZEN COMPLAINTS] Hide bottom nav while modals are open ---
  useHideBottomNav(
    detailsVisible || validationVisible || Boolean(privacyPhoto?.uri)
  );

  // --- [CITIZEN COMPLAINTS] Fonts ---
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [CITIZEN COMPLAINTS] Filters: apply cached page / switch filter ---
  const applyCachedComplaintsPage = (cached) => {
    if (!cached?.complaints) return false;

    complaintsDataRef.current = cached.complaints;
    setComplaintsData(cached.complaints);
    setComplaintsTotal(cached.total ?? cached.complaints.length);
    setHasMoreComplaints(cached.hasMore !== false);
    hasMoreRef.current = cached.hasMore !== false;

    if (cached.submittedCount != null) setSubmittedCount(cached.submittedCount);
    if (cached.emergencyCount != null) setEmergencyCount(cached.emergencyCount);
    if (cached.nonEmergencyCount != null) {
      setNonEmergencyCount(cached.nonEmergencyCount);
    }
    if (cached.currentUserId) setCurrentUserId(cached.currentUserId);

    return true;
  };

  const applyListFilter = (filter) => {
    setActiveFilter(filter);
    setPageCache(CITIZEN_COMPLAINTS_LAST_FILTER_KEY, { filter });
    applyCachedComplaintsPage(getPageCache(citizenComplaintsCacheKey(filter)));
  };

  // --- [CITIZEN COMPLAINTS] Sync filter from route param ---
  const appliedQueryFilterRef = useRef(
    params?.filter ? String(params.filter) : null
  );

  useEffect(() => {
    const next = params?.filter ? String(params.filter) : "";

    if (!FILTER_OPTIONS.includes(next)) return;
    if (appliedQueryFilterRef.current === next) return;

    appliedQueryFilterRef.current = next;
    applyListFilter(next);
  }, [params?.filter]);

  // --- [CITIZEN COMPLAINTS] Refs: pagination & validation-open guards ---
  const complaintsDataRef = useRef(cachedComplaintsPage?.complaints ?? []);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(cachedComplaintsPage?.hasMore !== false);
  const listViewportHeightRef = useRef(0);
  const loadingListRef = useRef(false);
  const openingValidationRef = useRef(false);
  const validationOpenTimerRef = useRef(null);

  useEffect(() => {
    complaintsDataRef.current = complaintsData;
  }, [complaintsData]);

  // --- [CITIZEN COMPLAINTS] Load complaints (cached + paginated, routing fix-ups) ---
  const loadComplaints = useCallback(async (options = {}) => {
    const append = options.append === true;
    const cacheKey = citizenComplaintsCacheKey(activeFilter);
    const cached = !append ? getPageCache(cacheKey) : null;

    if (!append && cached) {
      applyCachedComplaintsPage(cached);
    }

    const showLoader =
      options.showLoader ??
      (!append && shouldShowPageLoader(cacheKey));

    if (append) {
      if (loadingMoreRef.current || loadingListRef.current || !hasMoreRef.current) {
        return;
      }
      loadingMoreRef.current = true;
      setLoadingMoreComplaints(true);
    } else {
      hasMoreRef.current = cached?.hasMore !== false;
      loadingListRef.current = true;
    }

    try {
      if (showLoader) {
        setLoadingComplaints(true);
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!cached) {
          setCurrentUserId(null);
          setComplaintsData([]);
          setComplaintsTotal(0);
          setSubmittedCount(0);
          setEmergencyCount(0);
          setNonEmergencyCount(0);
          hasMoreRef.current = false;
          setHasMoreComplaints(false);
        }
        return;
      }

      setCurrentUserId(user.id);

      const offset = append ? complaintsDataRef.current.length : 0;
      const pageSize = append
        ? COMPLAINTS_PAGE_SIZE
        : Math.max(COMPLAINTS_PAGE_SIZE, cached?.complaints?.length || 0);

      await waitOffsetPageDelay(offset);

      let listQuery = supabase
        .from("complaints")
        .select("*", { count: "exact" })
        .eq("citizen_id", user.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (activeFilter === "All Emergency") {
        listQuery = applyComplaintOffsetFilters(listQuery, {
          isEmergency: true,
        });
      } else if (activeFilter === "All Non-Emergency") {
        listQuery = applyComplaintOffsetFilters(listQuery, {
          isEmergency: false,
        });
      } else if (activeFilter === "For Validation") {
        listQuery = applyComplaintOffsetFilters(listQuery, {
          statusIn: FOR_VALIDATION_STATUSES,
        });
      } else if (activeFilter !== "All") {
        listQuery = applyComplaintOffsetFilters(listQuery, {
          status: activeFilter,
        });
      }

      listQuery = applyOffsetPagination(listQuery, offset, pageSize);

      const listPromise = listQuery;
      const summaryPromise = append
        ? Promise.resolve({ data: null })
        : supabase
            .from("complaints")
            .select("is_emergency")
            .eq("citizen_id", user.id);

      const [{ data, error, count }, { data: summaryRows }] = await Promise.all([
        listPromise,
        summaryPromise,
      ]);

      if (error) {
        if (!cached) {
          notify("Load Failed", error.message);
        }
        if (!append && !cached) {
          setComplaintsData([]);
          setComplaintsTotal(0);
        }
        return;
      }

      const total = count ?? 0;
      setComplaintsTotal(total);

      const nextSubmittedCount =
        !append && summaryRows ? summaryRows.length : undefined;
      const nextEmergencyCount =
        !append && summaryRows
          ? summaryRows.filter((row) => Boolean(row.is_emergency)).length
          : undefined;
      const nextNonEmergencyCount =
        !append && summaryRows
          ? summaryRows.filter((row) => !row.is_emergency).length
          : undefined;

      if (nextSubmittedCount != null) setSubmittedCount(nextSubmittedCount);
      if (nextEmergencyCount != null) setEmergencyCount(nextEmergencyCount);
      if (nextNonEmergencyCount != null) {
        setNonEmergencyCount(nextNonEmergencyCount);
      }

      const routedRows = (data || []).map((row) => {
        const { category: fixedCategory, assignedOffice: fixedOffice } =
          resolveComplaintRouting(
            row.title,
            row.description,
            row.category || row.concern_category,
            row.assigned_office || row.assignedOffice || row.department
          );

        const fixedPriority = calculatePriorityFromKeywords(
          row.title,
          row.description,
          Boolean(row.is_emergency)
        );

        return {
          ...row,
          category: fixedCategory,
          assigned_office: fixedOffice,
          priority: fixedPriority,
        };
      });

      await Promise.all(
        routedRows.map((row) => {
          const original = data?.find((item) => item.id === row.id);
          const originalOffice = String(original?.assigned_office || "").trim();
          const nextOffice = String(row.assigned_office || "").trim();

          // Never overwrite a known office with Unassigned.
          if (
            nextOffice === "Unassigned" &&
            originalOffice &&
            originalOffice !== "Unassigned"
          ) {
            row.assigned_office = originalOffice;
          }

          const shouldUpdate =
            row.category !== original?.category ||
            row.assigned_office !== original?.assigned_office ||
            row.priority !== original?.priority;

          if (!shouldUpdate) return Promise.resolve();

          return supabase
            .from("complaints")
            .update({
              category: row.category,
              assigned_office: row.assigned_office,
              priority: row.priority,
            })
            .eq("id", row.id);
        })
      );

      const feedbackStatusById = await getLatestFeedbackStatusByComplaintIds(
        routedRows.map((row) => row.id)
      );

      const mappedComplaints = await Promise.all(
        routedRows.map((row) =>
          mapDatabaseComplaint({
            ...row,
            latest_feedback_status: feedbackStatusById[row.id] || null,
          })
        )
      );

      const nextComplaints = append
        ? mergeComplaintPages(complaintsDataRef.current, mappedComplaints)
        : mappedComplaints;

      complaintsDataRef.current = nextComplaints;
      setComplaintsData(nextComplaints);

      const loadedCount = nextComplaints.length;
      const hasMore = mappedComplaints.length > 0 && loadedCount < total;
      hasMoreRef.current = hasMore;
      setHasMoreComplaints(hasMore);

      const previousCache = getPageCache(cacheKey) || {};
      setPageCache(cacheKey, {
        ...previousCache,
        complaints: nextComplaints,
        total,
        hasMore,
        currentUserId: user.id,
        ...(nextSubmittedCount != null ? { submittedCount: nextSubmittedCount } : {}),
        ...(nextEmergencyCount != null ? { emergencyCount: nextEmergencyCount } : {}),
        ...(nextNonEmergencyCount != null
          ? { nonEmergencyCount: nextNonEmergencyCount }
          : {}),
      });
      setPageCache(CITIZEN_COMPLAINTS_LAST_FILTER_KEY, { filter: activeFilter });

      if (!append) {
        await requestCitizenValidationReminders(user.id);
      }
    } catch (error) {
      console.log("Load complaints error:", error);

      if (!append && !cached) {
        hasMoreRef.current = false;
        setHasMoreComplaints(false);
        notify("Load Failed", "Unable to load complaints.");
        setComplaintsData([]);
      }
    } finally {
      loadingListRef.current = false;
      setLoadingComplaints(false);

      if (append) {
        loadingMoreRef.current = false;
        setLoadingMoreComplaints(false);
      }
    }
  }, [activeFilter]);

  // --- [CITIZEN COMPLAINTS] Pagination: load more on scroll / fill viewport ---
  const loadComplaintsRef = useRef(loadComplaints);
  loadComplaintsRef.current = loadComplaints;

  const loadMoreComplaints = useCallback(() => {
    loadComplaints({ append: true, showLoader: false });
  }, [loadComplaints]);

  const handleComplaintsScroll = ({ nativeEvent }) => {
    if (isNearContentBottom(nativeEvent)) {
      loadMoreComplaints();
    }
  };

  const maybeFillViewport = (contentHeight) => {
    if (
      hasMoreRef.current &&
      !loadingMoreRef.current &&
      !loadingListRef.current &&
      listViewportHeightRef.current > 0 &&
      contentHeight < listViewportHeightRef.current + 80
    ) {
      loadMoreComplaints();
    }
  };

  // --- [CITIZEN COMPLAINTS] Reload on screen focus ---
  useFocusEffect(
    useCallback(() => {
      loadComplaints();
    }, [loadComplaints])
  );

  // --- [CITIZEN COMPLAINTS] Realtime: reload when own complaints change ---
  useEffect(() => {
    if (!currentUserId) return;

    const channelPrefix = `citizen-complaints-${currentUserId}`;

    supabase
      .getChannels()
      .filter((item) => item.topic?.startsWith(`realtime:${channelPrefix}`))
      .forEach((item) => {
        supabase.removeChannel(item);
      });

    const channel = supabase
      .channel(`${channelPrefix}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
          filter: `citizen_id=eq.${currentUserId}`,
        },
        () => {
          loadComplaintsRef.current?.();
        }
      )
      .subscribe((status) => {
        console.log("Citizen complaints realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // --- [CITIZEN COMPLAINTS] Sorting & filtered list ---
  const sortedComplaintsData = useMemo(() => {
    return [...complaintsData].sort((a, b) => {
      const rank = getStatusSortRank(a.status) - getStatusSortRank(b.status);

      if (rank !== 0) return rank;

      return parseSubmittedAt(b.submittedAt) - parseSubmittedAt(a.submittedAt);
    });
  }, [complaintsData]);

  const filteredComplaints = useMemo(() => {
    if (activeFilter === "All") return sortedComplaintsData;

    if (activeFilter === "All Emergency") {
      return sortedComplaintsData.filter(
        (item) => item.concernType === "Emergency"
      );
    }

    if (activeFilter === "All Non-Emergency") {
      return sortedComplaintsData.filter(
        (item) => item.concernType === "Non-Emergency"
      );
    }

    if (activeFilter === "For Validation") {
      return sortedComplaintsData.filter((item) =>
        FOR_VALIDATION_STATUSES.includes(item.status)
      );
    }

    return sortedComplaintsData.filter((item) => item.status === activeFilter);
  }, [activeFilter, sortedComplaintsData]);

  // --- [CITIZEN COMPLAINTS] Auto-open complaint from route params (details/validation) ---
  useEffect(() => {
    if (!targetComplaintId) return;
    if (loadingComplaints) return;
    if (autoOpenedComplaintId === targetComplaintId) return;

    const matchedComplaint = sortedComplaintsData.find(
      (item) => String(item.id) === targetComplaintId
    );

    if (matchedComplaint) {
      setSelectedComplaint(matchedComplaint);
      if (shouldOpenValidation && canCitizenSubmitValidation(matchedComplaint)) {
        openValidation(matchedComplaint);
      } else {
        setDetailsVisible(true);
      }
      setAutoOpenedComplaintId(targetComplaintId);
      return;
    }

    let cancelled = false;

    const openFromQuery = async () => {
      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("id", targetComplaintId)
        .maybeSingle();

      if (cancelled || error || !data) return;

      const mappedComplaint = await mapDatabaseComplaint(data);
      setSelectedComplaint(mappedComplaint);
      if (shouldOpenValidation && canCitizenSubmitValidation(mappedComplaint)) {
        openValidation(mappedComplaint);
      } else {
        setDetailsVisible(true);
      }
      setAutoOpenedComplaintId(targetComplaintId);
    };

    openFromQuery();

    return () => {
      cancelled = true;
    };
  }, [
    autoOpenedComplaintId,
    loadingComplaints,
    shouldOpenValidation,
    sortedComplaintsData,
    targetComplaintId,
  ]);

  // --- [CITIZEN COMPLAINTS] Details modal: open / close ---
  const openDetails = (complaint) => {
    if (openingValidationRef.current || validationVisible) return;
    setSelectedComplaint(complaint);
    setDetailsVisible(true);
  };

  const closeDetails = () => {
    setDetailsVisible(false);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  // --- [CITIZEN COMPLAINTS] Photo viewer: open / close ---
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

  // --- [CITIZEN COMPLAINTS] Validation flow: open modal ---
  const openValidation = (complaint) => {
    Keyboard.dismiss();

    if (!canCitizenSubmitValidation(complaint)) {
      notify(
        "Already Validated",
        "You already submitted your validation feedback for this complaint. Please wait for the admin review."
      );
      return;
    }

    if (validationOpenTimerRef.current) {
      clearTimeout(validationOpenTimerRef.current);
      validationOpenTimerRef.current = null;
    }

    openingValidationRef.current = true;
    setSelectedComplaint(complaint);
    setFeedback("");
    setValidationPhotos([]);
    setValidationAnswer(null);
    setDetailsVisible(false);
    setPhotoViewerVisible(false);

    // Wait for the details modal to finish closing so both sheets don't fight.
    validationOpenTimerRef.current = setTimeout(() => {
      setValidationVisible(true);
      openingValidationRef.current = false;
      validationOpenTimerRef.current = null;
    }, 280);
  };

  useEffect(() => {
    return () => {
      if (validationOpenTimerRef.current) {
        clearTimeout(validationOpenTimerRef.current);
      }
    };
  }, []);

  // --- [CITIZEN COMPLAINTS] Validation photos: check, resize, queue for privacy blur ---
  const addValidationPhotoAssets = async (assets = []) => {
    const remainingSlots = MAX_VALIDATION_PHOTOS - validationPhotos.length;

    if (remainingSlots <= 0) {
      notify(
        "Photo Limit Reached",
        "You can only upload up to 3 validation photos."
      );
      return;
    }

    let invalidFormatCount = 0;
    let invalidSizeCount = 0;
    let failedPrepareCount = 0;

    const validAssets = [];

    for (const asset of assets.slice(0, remainingSlots)) {
      const validFormat = isValidImageFormat(asset);
      const validSize =
        !asset.fileSize || Number(asset.fileSize) <= MAX_PHOTO_SIZE;

      if (!validFormat) {
        invalidFormatCount += 1;
        continue;
      }

      if (!validSize) {
        invalidSizeCount += 1;
        continue;
      }

      const preparedPhoto = await prepareValidationPhotoAsset(asset);

      if (!preparedPhoto) {
        failedPrepareCount += 1;
        continue;
      }

      validAssets.push(preparedPhoto);
    }

    if (
      invalidFormatCount > 0 ||
      invalidSizeCount > 0 ||
      failedPrepareCount > 0
    ) {
      notify(
        "Some Photos Were Not Added",
        "Only PNG, JPG, JPEG, HEIC, and HEIF files are allowed, with a maximum size of 10MB per photo."
      );
    }

    if (validAssets.length === 0) return;

    const [firstPhoto, ...restPhotos] = validAssets;
    setPrivacyQueue(restPhotos);
    setPrivacyReplaceId(null);
    setPrivacyPhoto(firstPhoto);
  };

  // --- [CITIZEN COMPLAINTS] Privacy blur editor: finish / close / reopen ---
  const finishPrivacyValidationPhoto = (photo) => {
    if (privacyReplaceId) {
      setValidationPhotos((prev) =>
        prev.map((item) =>
          item.id === privacyReplaceId ? { ...item, ...photo, id: item.id } : item
        )
      );
    } else {
      setValidationPhotos((prev) =>
        [...prev, photo].slice(0, MAX_VALIDATION_PHOTOS)
      );
    }

    const [nextPhoto, ...restPhotos] = privacyQueue;
    setPrivacyQueue(restPhotos);
    setPrivacyReplaceId(null);
    setPrivacyPhoto(nextPhoto || null);
  };

  const closePrivacyEditor = () => {
    const [nextPhoto, ...restPhotos] = privacyQueue;
    setPrivacyQueue(restPhotos);
    setPrivacyReplaceId(null);
    setPrivacyPhoto(nextPhoto || null);
  };

  const openPrivacyEditorForPhoto = (photo) => {
    if (!photo?.uri) return;
    setPrivacyQueue([]);
    setPrivacyReplaceId(photo.id);
    setPrivacyPhoto(photo);
  };

  // --- [CITIZEN COMPLAINTS] Validation photos: camera ---
  const openCameraForValidationPhoto = async () => {
    try {
      await markMediaPickerSession("/citizen/complaints");

      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (permission.status !== "granted") {
        scheduleClearMediaPickerSession();
        notify(
          "Permission Needed",
          "Please allow camera access so you can take validation evidence photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });

      scheduleClearMediaPickerSession();

      if (result.canceled || !result.assets?.length) return;

      await addValidationPhotoAssets(result.assets);
    } catch (error) {
      scheduleClearMediaPickerSession();
      console.log("Validation camera error:", error);
      notify(
        "Camera Error",
        "The app could not open the camera. Please try again or choose a photo from your gallery."
      );
    }
  };

  // --- [CITIZEN COMPLAINTS] Validation photos: gallery ---
  const openGalleryForValidationPhoto = async () => {
    try {
      const remainingSlots = MAX_VALIDATION_PHOTOS - validationPhotos.length;

      if (remainingSlots <= 0) {
        notify(
          "Photo Limit Reached",
          "You can only upload up to 3 validation photos."
        );
        return;
      }

      await markMediaPickerSession("/citizen/complaints");

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        scheduleClearMediaPickerSession();
        notify(
          "Permission Needed",
          "Please allow photo access so you can upload validation evidence."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: remainingSlots > 1,
        selectionLimit: remainingSlots,
        quality: 0.9,
      });

      scheduleClearMediaPickerSession();

      if (result.canceled || !result.assets?.length) return;

      await addValidationPhotoAssets(result.assets);
    } catch (error) {
      scheduleClearMediaPickerSession();
      console.log("Validation gallery error:", error);
      notify(
        "Photo Error",
        "The app could not open or load the selected photo. Please try again."
      );
    }
  };

  // --- [CITIZEN COMPLAINTS] Validation photos: picker prompt & remove ---
  const pickValidationPhoto = () => {
    Keyboard.dismiss();

    if (validationPhotos.length >= MAX_VALIDATION_PHOTOS) {
      notify(
        "Photo Limit Reached",
        "You can only upload up to 3 validation photos."
      );
      return;
    }

    notify(
      "Add Validation Photo",
      "Take a photo with your camera or choose from your gallery.",
      [
        { text: "Take Photo", onPress: () => openCameraForValidationPhoto() },
        {
          text: "Choose from Gallery",
          onPress: () => openGalleryForValidationPhoto(),
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const removeValidationPhoto = (photoId) => {
    setValidationPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  };

  // --- [CITIZEN COMPLAINTS] Submit validation + AI validation ---
  const submitValidation = async () => {
    Keyboard.dismiss();

    if (submittingValidation) return;

    if (!selectedComplaint?.id) {
      notify("Validation Failed", "Complaint record was not found.");
      return;
    }

    if (!validationAnswer) {
      notify(
        "Validation Required",
        "Please choose whether the issue was resolved or not."
      );
      return;
    }

    if (!feedback.trim()) {
      notify(
        "Feedback Required",
        "Please provide your feedback before submitting validation."
      );
      return;
    }

    if (validationPhotos.length === 0) {
      notify(
        "Photo Evidence Required",
        "Please upload at least one photo evidence to support your validation."
      );
      return;
    }

    if (!canCitizenSubmitValidation(selectedComplaint)) {
      notify(
        "Already Validated",
        "You already submitted your validation feedback for this complaint. Please wait for the admin review."
      );
      return;
    }

    try {
      setSubmittingValidation(true);

      // --- [CITIZEN COMPLAINTS] Submit: upload photos & save feedback snapshot ---
      const uploadedValidationPhotos = await uploadValidationPhotos(
        selectedComplaint.id,
        validationPhotos
      );

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const citizenId = user?.id || currentUserId;
      const validationSubmittedAt = new Date().toISOString();

      const { data: feedbackRow } = await insertComplaintFeedback({
        complaintId: selectedComplaint.id,
        citizenId,
        answer: validationAnswer,
        feedback: feedback.trim(),
        photoUrls: uploadedValidationPhotos,
      });

      const updatePayload = {
        status: "For Validation",
        validation_status: "Validated",
        citizen_validation_status: "Validated",
        citizen_validation_answer: validationAnswer,
        citizen_validation_feedback: feedback.trim(),
        citizen_validation_photo_urls: uploadedValidationPhotos,
        citizen_validated_at: validationSubmittedAt,
        ai_validation_status: "pending",
        ai_validation_approved: null,
        ai_validation_summary: "AI is reviewing the validation evidence.",
        ai_validation_reason: null,
        ai_validation_recommendation: null,
        ai_validated_at: null,
      };

      let { error } = await supabase
        .from("complaints")
        .update(updatePayload)
        .eq("id", selectedComplaint.id);

      if (error) {
        const { status: _status, ...withoutStatus } = updatePayload;
        const retry = await supabase
          .from("complaints")
          .update(withoutStatus)
          .eq("id", selectedComplaint.id);
        error = retry.error;
      }

      if (error && !feedbackRow?.id) {
        notify("Validation Failed", error.message);
        return;
      }

      if (error) {
        console.log("Complaint snapshot update after feedback error:", error);
      }

      // --- [CITIZEN COMPLAINTS] Submit: Gemini AI resolution check ---
      let aiValidation = null;

      try {
        const localValidationUris = validationPhotos
          .map((photo) => photo?.uri)
          .filter(Boolean);
        const originalPhotoUris = (
          selectedComplaint.photoUrls ||
          (selectedComplaint.photo ? [selectedComplaint.photo] : [])
        ).filter(
          (uri) =>
            uri &&
            !String(uri).includes("placehold.co") &&
            !String(uri).includes("placeholder")
        );

        aiValidation = await validateResolutionWithGemini({
          title: selectedComplaint.title,
          description: selectedComplaint.description,
          category: selectedComplaint.category,
          locationText: selectedComplaint.location,
          citizenAnswer: validationAnswer,
          citizenFeedback: feedback.trim(),
          originalPhotoUris,
          validationPhotoUris:
            localValidationUris.length > 0
              ? localValidationUris
              : uploadedValidationPhotos,
        });

        const { error: aiError } = await supabase
          .from("complaints")
          .update(buildResolutionValidationDbPayload(aiValidation))
          .eq("id", selectedComplaint.id);

        if (aiError) {
          console.log("Save AI validation result error:", aiError);
        }

        await updateComplaintFeedbackAi(
          feedbackRow?.id,
          buildResolutionValidationDbPayload(aiValidation)
        );
      } catch (aiError) {
        console.log("AI resolution validation error:", aiError);
        aiValidation = {
          approved: false,
          status: "error",
          confidence: 0,
          summary: "AI validation could not finish. Admin review is required.",
          reason: aiError?.message || "AI validation failed.",
          recommendation: "needs_human_review",
          validated_at: new Date().toISOString(),
        };

        await supabase
          .from("complaints")
          .update({
            ai_validation_status: "error",
            ai_validation_approved: false,
            ai_validation_summary: aiValidation.summary,
            ai_validation_reason: aiValidation.reason,
            ai_validation_recommendation: "needs_human_review",
            ai_validation_result: aiValidation,
            ai_validated_at: aiValidation.validated_at,
          })
          .eq("id", selectedComplaint.id);

        await updateComplaintFeedbackAi(feedbackRow?.id, {
          ai_validation_status: "error",
          ai_validation_approved: false,
          ai_validation_summary: aiValidation.summary,
          ai_validation_reason: aiValidation.reason,
          ai_validation_result: aiValidation,
        });
      }

      // --- [CITIZEN COMPLAINTS] Submit: update local list & reset form ---
      const resolvedValidationPhotoUrls = [];

      for (const path of uploadedValidationPhotos) {
        const readable = await createReadableComplaintPhotoUrl(path);
        if (readable) resolvedValidationPhotoUrls.push(readable);
      }

      const updatedComplaint = {
        ...selectedComplaint,
        status: "For Validation",
        latestFeedbackStatus: "submitted",
        validationSubmitted: true,
        validationResult: validationAnswer,
        validationFeedback: feedback.trim(),
        validationPhotoUrls:
          resolvedValidationPhotoUrls.length > 0
            ? resolvedValidationPhotoUrls
            : uploadedValidationPhotos,
        aiValidationStatus: aiValidation?.status || "pending",
        aiValidationApproved: Boolean(aiValidation?.approved),
        aiValidationSummary: aiValidation?.summary || null,
        aiValidationReason: aiValidation?.reason || null,
        aiValidationRecommendation: aiValidation?.recommendation || null,
      };

      setComplaintsData((prev) =>
        prev.map((item) =>
          item.id === selectedComplaint.id
            ? {
                ...item,
                status: "For Validation",
                latestFeedbackStatus: "submitted",
                validationSubmitted: true,
                validationResult: validationAnswer,
                validationFeedback: feedback.trim(),
                validationPhotoUrls: updatedComplaint.validationPhotoUrls,
                aiValidationStatus: updatedComplaint.aiValidationStatus,
                aiValidationApproved: updatedComplaint.aiValidationApproved,
                aiValidationSummary: updatedComplaint.aiValidationSummary,
                aiValidationReason: updatedComplaint.aiValidationReason,
                aiValidationRecommendation:
                  updatedComplaint.aiValidationRecommendation,
              }
            : item
        )
      );

      setSelectedComplaint(updatedComplaint);
      setValidationVisible(false);
      setFeedback("");
      setValidationPhotos([]);
      setValidationAnswer(null);

      // --- [CITIZEN COMPLAINTS] Submit: notify admins/citizen + audit log ---
      const citizenName = await getProfileDisplayName(citizenId);

      const notifyResult = await notifyAdminsCitizenValidated({
        complaint: {
          id: selectedComplaint.id,
          short_id: selectedComplaint.shortId,
          title: selectedComplaint.title,
          category: selectedComplaint.category,
          assigned_office: selectedComplaint.assignedOffice,
          location_text: selectedComplaint.location,
          status: "For Validation",
        },
        validationAnswer,
        citizenName,
      });

      if (!notifyResult?.success) {
        console.log("Admin validation notification error:", notifyResult);
      }

      const aiStatus = String(aiValidation?.status || "").toLowerCase();

      if (aiStatus === "approved" || aiStatus === "rejected") {
        const citizenNotifyResult = await notifyCitizenAiValidationResult({
          citizenId: citizenId || currentUserId,
          complaintId: selectedComplaint.id,
          shortId: selectedComplaint.shortId || selectedComplaint.id,
          approved: aiStatus === "approved",
          reason: aiValidation?.reason,
          summary: aiValidation?.summary,
        });

        if (!citizenNotifyResult?.success) {
          console.log(
            "Citizen AI validation notification error:",
            citizenNotifyResult
          );
        }
      }

      const aiNote =
        aiValidation?.status === "approved"
          ? " AI also approved the validation evidence."
          : aiValidation?.status === "rejected"
            ? " AI flagged the validation evidence for admin review."
            : " AI validation is pending or needs admin review.";

      notify(
        "Validation Submitted",
        validationAnswer === "resolved"
          ? `Thank you. Your feedback was submitted.${aiNote} The admin will review it before marking the complaint as completed.`
          : `Thank you. Your feedback was submitted.${aiNote} The admin may return the complaint to the department if further action is needed.`
      );

      writeAuditLog({
        action: "citizen_validation",
        title: "Validation Submitted",
        description: `Validation feedback was submitted for complaint #${
          selectedComplaint.shortId || selectedComplaint.id
        }.`,
        entityType: "complaint",
        entityId: selectedComplaint.id,
        actorRole: "citizen",
        metadata: {
          validation_answer: validationAnswer,
          analysis_type: "resolution_performance",
        },
      });

      await loadComplaints();
    } catch (error) {
      console.log("Submit validation error:", error);
      notify(
        "Validation Failed",
        error?.message || "Unable to submit validation feedback."
      );
    } finally {
      setSubmittingValidation(false);
    }
  };

  // --- [CITIZEN COMPLAINTS] Render ---
  if (!fontsLoaded && !cachedComplaintsPage) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(255, 255, 255, 1)" />

      <View style={styles.mainContainer}>
        {/* [CITIZEN COMPLAINTS UI] Sticky header: title & description */}
        <View style={styles.stickyHeader}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>My Complaints</Text>
            <Text style={styles.headerDescription}>
              Monitor complaint status and validate resolved reports.
            </Text>
          </View>

          {/* [CITIZEN COMPLAINTS UI] Record count */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Complaint Records</Text>
            {loadingComplaints && complaintsData.length === 0 ? (
              <Skeleton width={72} height={12} borderRadius={6} />
            ) : (
              <Text style={styles.sectionCount}>
                {`${complaintsData.length} of ${complaintsTotal}`}
              </Text>
            )}
          </View>

          {/* [CITIZEN COMPLAINTS UI] Summary card: total submitted */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryIconCircle}>
                <MaterialCommunityIcons
                  name="file-document-multiple-outline"
                  size={28}
                  color="rgba(255, 255, 255, 1)"
                />
              </View>

              <View style={styles.summaryTextBox}>
                {loadingComplaints && complaintsData.length === 0 ? (
                  <Skeleton width={180} height={16} borderRadius={7} />
                ) : (
                  <Text style={styles.summaryTitle}>
                    {`${submittedCount} submitted complaints`}
                  </Text>
                )}
                <Text style={styles.summarySubtitle}>
                  Track each report from submission to final resolution.
                </Text>
              </View>
            </View>

            {/* [CITIZEN COMPLAINTS UI] Emergency / non-emergency filter chips */}
            <View style={styles.concernSummaryRow}>
              <TouchableOpacity
                activeOpacity={0.78}
                style={[
                  styles.concernSummaryPillEmergency,
                  activeFilter === "All Emergency" &&
                    styles.concernSummaryPillActive,
                ]}
                onPress={() => applyListFilter("All Emergency")}
              >
                <Feather name="alert-triangle" size={12} color="rgba(255, 255, 255, 1)" />
                <Text style={styles.concernSummaryText} numberOfLines={1}>
                  {emergencyCount} Emergency
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.78}
                style={[
                  styles.concernSummaryPillNormal,
                  activeFilter === "All Non-Emergency" &&
                    styles.concernSummaryPillActive,
                ]}
                onPress={() => applyListFilter("All Non-Emergency")}
              >
                <Feather name="check-circle" size={12} color="rgba(255, 255, 255, 1)" />
                <Text style={styles.concernSummaryText} numberOfLines={1}>
                  {nonEmergencyCount} Non-Emergency
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* [CITIZEN COMPLAINTS UI] Status filter chips */}
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {filters.map((filter) => {
              const isActive = activeFilter === filter;

              return (
                <TouchableOpacity
                  key={filter}
                  activeOpacity={0.75}
                  style={[
                    styles.filterPill,
                    isActive && styles.filterPillActive,
                  ]}
                  onPress={() => applyListFilter(filter)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      isActive && styles.filterTextActive,
                    ]}
                  >
                    {filter}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* [CITIZEN COMPLAINTS UI] Complaint list (infinite scroll) */}
        <ScrollView
          style={styles.listScroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={handleComplaintsScroll}
          onLayout={(event) => {
            listViewportHeightRef.current = event.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, height) => maybeFillViewport(height)}
        >
          {/* [CITIZEN COMPLAINTS UI] Loading skeleton / empty state / complaint cards */}
          {loadingComplaints && complaintsData.length === 0 ? (
            <ComplaintListSkeleton count={COMPLAINTS_PAGE_SIZE} />
          ) : filteredComplaints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={38} color="rgba(111, 119, 111, 1)" />
              <Text style={styles.emptyTitle}>
                {activeFilter === "Returned"
                  ? "No returned complaints"
                  : activeFilter === "For Validation"
                    ? "No complaints waiting for validation"
                    : "No submitted complaints yet"}
              </Text>
              <Text style={styles.emptyText}>
                {activeFilter === "Returned"
                  ? "When a complaint is returned, it will show up here so you can submit validation again."
                  : "Complaints you submit will appear here."}
              </Text>
            </View>
          ) : (
            <View style={styles.complaintList}>
              {filteredComplaints.map((item) => {
                const statusStyle = getStatusStyle(item.status);
                const priorityStyle = getPriorityStyle(item.priority);
                const concernStyle = getConcernStyle(item.concernType);

                return (
                  <View key={item.id} style={styles.complaintCard}>
                    {/* [CITIZEN COMPLAINTS UI] Card body (tap opens details) */}
                    <TouchableOpacity
                      activeOpacity={0.78}
                      onPress={() => openDetails(item)}
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
                                size={10}
                                color={concernStyle.color}
                              />
                              <Text
                                style={[
                                  styles.concernText,
                                  { color: concernStyle.color },
                                ]}
                              >
                                {item.concernType}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* [CITIZEN COMPLAINTS UI] Card details: category, office, location, date, time */}
                      <View style={styles.detailRow}>
                        <Feather name="tag" size={13} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.detailText} numberOfLines={1}>
                          Category: {item.category}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Feather name="briefcase" size={13} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.detailText} numberOfLines={1}>
                          Assigned Office: {item.assignedOffice}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Feather name="map-pin" size={13} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.detailText} numberOfLines={1}>
                          {item.location}
                        </Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Feather name="calendar" size={13} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.detailText}>{item.date}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Feather name="clock" size={13} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.detailText}>{item.time}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* [CITIZEN COMPLAINTS UI] Card footer: status badge & action */}
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

                      {/* [CITIZEN COMPLAINTS UI] Action: Validate / Validated / View Details */}
                      {canCitizenSubmitValidation(item) ? (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={styles.validateButton}
                          onPress={() => openValidation(item)}
                        >
                          <Text style={styles.validateButtonText}>
                            {isValidationResubmit(item) ? "Resubmit" : "Validate"}
                          </Text>
                        </TouchableOpacity>
                      ) : item.status === "For Validation" &&
                        item.validationSubmitted ? (
                        <View style={styles.validatedButton}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={15}
                            color="rgba(111, 119, 111, 1)"
                          />
                          <Text style={styles.validatedButtonText}>
                            Validated
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={styles.viewRow}
                          onPress={() => openDetails(item)}
                        >
                          <Text style={styles.viewText}>View Details</Text>
                          <Feather name="chevron-right" size={16} color="rgba(8, 122, 13, 1)" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* [CITIZEN COMPLAINTS UI] Load-more footer */}
          <ComplaintsLoadMoreFooter loading={loadingMoreComplaints} />
        </ScrollView>

        {/* [CITIZEN COMPLAINTS UI] Details modal */}
        <Modal
          visible={detailsVisible}
          animationType="slide"
          transparent
          onRequestClose={closeDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.modalHandle} />

              {/* [CITIZEN COMPLAINTS UI] Details modal: header & close */}
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Complaint Details</Text>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}
                  onPress={closeDetails}
                >
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
                </TouchableOpacity>
              </View>

              {/* [CITIZEN COMPLAINTS UI] Details modal: scrollable content */}
              {selectedComplaint && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* [CITIZEN COMPLAINTS UI] Details: complaint photos & validation photos */}
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
                                style={styles.detailsImage}
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
                            style={styles.detailsImage}
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

                  {/* [CITIZEN COMPLAINTS UI] Details: title & description */}
                  <Text style={styles.detailsComplaintTitle}>
                    {selectedComplaint.title}
                  </Text>

                  <Text style={styles.detailsDescription}>
                    {selectedComplaint.description}
                  </Text>

                  {/* [CITIZEN COMPLAINTS UI] Details: info card */}
                  <View style={styles.detailsInfoCard}>
                    <Text style={styles.detailsLabel}>Complaint ID</Text>
                    <Text style={styles.detailsValue}>
                      {selectedComplaint.shortId}
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

                  {/* [CITIZEN COMPLAINTS UI] Details: status timeline */}
                  <Text style={styles.timelineTitle}>Status Timeline</Text>

                  <View style={styles.timelineBox}>
                    {selectedComplaint.timeline.map((step, index) => (
                      <View key={step.label} style={styles.timelineRow}>
                        <View style={styles.timelineIndicatorBox}>
                          <View
                            style={[
                              styles.timelineCircle,
                              step.done && styles.timelineCircleDone,
                            ]}
                          >
                            {step.done && (
                              <Feather name="check" size={11} color="rgba(255, 255, 255, 1)" />
                            )}
                          </View>

                          {index !== selectedComplaint.timeline.length - 1 && (
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

                  {/* [CITIZEN COMPLAINTS UI] Details: validate button / validated notice */}
                  {canCitizenSubmitValidation(selectedComplaint) ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.detailsValidateButton}
                      onPress={() => openValidation(selectedComplaint)}
                    >
                      <Ionicons name="camera-outline" size={21} color="rgba(255, 255, 255, 1)" />
                      <Text style={styles.detailsValidateText}>
                        {isValidationResubmit(selectedComplaint)
                          ? "Submit Validation Again"
                          : "Provide Feedback & Photo Evidence"}
                      </Text>
                    </TouchableOpacity>
                  ) : selectedComplaint.status === "For Validation" &&
                    selectedComplaint.validationSubmitted ? (
                    <View style={styles.detailsValidatedButton}>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={21}
                        color="rgba(111, 119, 111, 1)"
                      />
                      <Text style={styles.detailsValidatedText}>
                        Validated — waiting for admin review
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>

            {/* [CITIZEN COMPLAINTS UI] Details: fullscreen photo viewer overlay */}
            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && detailsVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        {/* [CITIZEN COMPLAINTS UI] Validation modal */}
        <Modal
          visible={validationVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            Keyboard.dismiss();
            if (validationOpenTimerRef.current) {
              clearTimeout(validationOpenTimerRef.current);
              validationOpenTimerRef.current = null;
            }
            openingValidationRef.current = false;
            setValidationVisible(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.validationSheet}>
              <View style={styles.modalHandle} />

              {/* [CITIZEN COMPLAINTS UI] Validation modal: header & close */}
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Citizen Validation</Text>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (validationOpenTimerRef.current) {
                      clearTimeout(validationOpenTimerRef.current);
                      validationOpenTimerRef.current = null;
                    }
                    openingValidationRef.current = false;
                    setValidationVisible(false);
                  }}
                >
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
                </TouchableOpacity>
              </View>

              {/* [CITIZEN COMPLAINTS UI] Validation modal: form (keyboard-aware scroll) */}
              {selectedComplaint && (
                <KeyboardAwareScrollView
                  modal
                  smoothKeyboard
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode={
                    Platform.OS === "ios" ? "interactive" : "on-drag"
                  }
                  contentContainerStyle={styles.validationScrollContent}
                >
                    {/* [CITIZEN COMPLAINTS UI] Validation: intro & complaint summary */}
                    <Text style={styles.validationIntro}>
                      {isValidationResubmit(selectedComplaint)
                        ? "This complaint was returned for more work and is now For Validation again. Please submit your validation feedback."
                        : "The responsible department marked this complaint as Resolved / For Validation. Please confirm if the issue was properly addressed."}
                    </Text>

                    <View style={styles.validationComplaintBox}>
                      <Text style={styles.validationComplaintTitle}>
                        {selectedComplaint.title}
                      </Text>
                      <Text style={styles.validationComplaintLocation}>
                        {selectedComplaint.location}
                      </Text>
                    </View>

                    {/* [CITIZEN COMPLAINTS UI] Validation: resolved? Yes / No answer */}
                    <Text style={styles.inputLabel}>Was the issue resolved?</Text>

                    <View style={styles.answerRow}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={[
                          styles.answerButton,
                          validationAnswer === "resolved" &&
                            styles.answerButtonActive,
                        ]}
                        onPress={() => {
                          Keyboard.dismiss();
                          setValidationAnswer("resolved");
                        }}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={20}
                          color={validationAnswer === "resolved" ? "rgba(255, 255, 255, 1)" : "rgba(8, 122, 13, 1)"}
                        />

                        <Text
                          style={[
                            styles.answerText,
                            validationAnswer === "resolved" &&
                              styles.answerTextActive,
                          ]}
                        >
                          Yes
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={[
                          styles.answerButton,
                          validationAnswer === "not_resolved" &&
                            styles.answerButtonDanger,
                        ]}
                        onPress={() => {
                          Keyboard.dismiss();
                          setValidationAnswer("not_resolved");
                        }}
                      >
                        <Ionicons
                          name="close-circle-outline"
                          size={20}
                          color={
                            validationAnswer === "not_resolved" ? "rgba(255, 255, 255, 1)" : "rgba(215, 25, 32, 1)"
                          }
                        />

                        <Text
                          style={[
                            styles.answerText,
                            validationAnswer === "not_resolved" &&
                              styles.answerTextActive,
                          ]}
                        >
                          No
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* [CITIZEN COMPLAINTS UI] Validation: feedback input */}
                    <Text style={styles.inputLabel}>Feedback</Text>

                    <TextInput
                      style={[
                        styles.feedbackInput,
                        Platform.OS === "android" && styles.feedbackInputNoOutline,
                      ]}
                      value={feedback}
                      onChangeText={setFeedback}
                      placeholder="Write your feedback here..."
                      placeholderTextColor="rgba(154, 154, 154, 1)"
                      multiline
                      textAlignVertical="top"
                    />

                    {/* [CITIZEN COMPLAINTS UI] Validation: photo evidence (add / previews) */}
                    <Text style={styles.inputLabel}>Photo Evidence</Text>

                    <View style={styles.photoUploadBox}>
                      {validationPhotos.length === 0 ? (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={styles.emptyPhotoUpload}
                          onPress={pickValidationPhoto}
                        >
                          <Ionicons name="camera" size={32} color="rgba(8, 122, 13, 1)" />

                          <Text style={styles.photoUploadText}>
                            Add validation photo
                          </Text>

                          <Text style={styles.photoRulesText}>
                            Camera or gallery • Up to 3 photos • JPG, PNG, HEIC •
                            Max 10MB each{"\n"}
                            The app automatically blurs faces, IDs, and other private details.
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.selectedPhotosSection}>
                          <Text style={styles.selectedCountText}>
                            {validationPhotos.length}/3 photo
                            {validationPhotos.length > 1 ? "s" : ""} selected
                          </Text>

                          {/* [CITIZEN COMPLAINTS UI] Photo thumbnails with blur & remove buttons */}
                          <View style={styles.validationPhotoRow}>
                            {validationPhotos.map((photo) => (
                              <View
                                key={photo.id}
                                style={styles.validationPhotoBox}
                              >
                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  onPress={() => openPhotoViewer(photo.uri)}
                                >
                                  <Image
                                    source={{ uri: photo.uri }}
                                    style={styles.validationPhotoPreview}
                                  />
                                </TouchableOpacity>

                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  style={styles.blurPhotoButton}
                                  onPress={() => openPrivacyEditorForPhoto(photo)}
                                >
                                  <Ionicons
                                    name="eye-off-outline"
                                    size={12}
                                    color="rgba(255, 255, 255, 1)"
                                  />
                                </TouchableOpacity>

                                <TouchableOpacity
                                  activeOpacity={0.8}
                                  style={styles.removePhotoButton}
                                  onPress={() => removeValidationPhoto(photo.id)}
                                >
                                  <Ionicons
                                    name="close"
                                    size={13}
                                    color="rgba(255, 255, 255, 1)"
                                  />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>

                          {validationPhotos.length < MAX_VALIDATION_PHOTOS && (
                            <TouchableOpacity
                              activeOpacity={0.75}
                              style={styles.addMorePhotoButton}
                              onPress={pickValidationPhoto}
                            >
                              <Ionicons
                                name="add-circle-outline"
                                size={17}
                                color="rgba(8, 122, 13, 1)"
                              />

                              <Text style={styles.addMorePhotoText}>
                                Add More Photos
                              </Text>
                            </TouchableOpacity>
                          )}

                          <Text style={styles.photoRulesText}>
                            Accepted: JPG, JPEG, PNG • Max 10MB per photo
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* [CITIZEN COMPLAINTS UI] Validation: submit button */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={submittingValidation}
                      style={[
                        styles.submitValidationButton,
                        submittingValidation && styles.submitValidationButtonDisabled,
                      ]}
                      onPress={submitValidation}
                    >
                      {submittingValidation ? (
                        <ActivityIndicator size="small" color="rgba(255, 255, 255, 1)" />
                      ) : (
                        <Text style={styles.submitValidationText}>
                          Submit Validation
                        </Text>
                      )}
                    </TouchableOpacity>
                </KeyboardAwareScrollView>
              )}
            </View>

            {/* [CITIZEN COMPLAINTS UI] Validation: fullscreen photo viewer overlay */}
            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && validationVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        {/* [CITIZEN COMPLAINTS UI] Standalone fullscreen photo viewer */}
        <FullscreenPhotoViewer
          visible={
            photoViewerVisible && !detailsVisible && !validationVisible
          }
          uri={selectedPhoto}
          onClose={closePhotoViewer}
        />

        {/* [CITIZEN COMPLAINTS UI] Privacy blur editor for validation photos */}
        <EvidencePrivacyEditor
          visible={Boolean(privacyPhoto?.uri)}
          uri={privacyPhoto?.uri}
          onCancel={closePrivacyEditor}
          onKeepOriginal={() => {
            if (privacyPhoto) finishPrivacyValidationPhoto(privacyPhoto);
          }}
          onSaved={(uri) => {
            if (!privacyPhoto) return;
            finishPrivacyValidationPhoto({
              ...privacyPhoto,
              uri,
              id: `${uri}-${Date.now()}`,
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// ===== [CITIZEN COMPLAINTS] Styles =====
const styles = StyleSheet.create({
  // --- Layout & sticky header ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  stickyHeader: {
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
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

  header: {
    minHeight: 62,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(238, 238, 238, 1)",
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
    marginTop: 6,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "rgba(8, 122, 13, 1)",
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    marginTop: -2,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  // --- Summary card & concern chips ---
  summaryCard: {
    borderRadius: 18,
    backgroundColor: "rgba(8, 122, 13, 1)",
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.1,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  summaryTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  summaryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  summaryTextBox: {
    flex: 1,
    paddingRight: 4,
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
    lineHeight: 15,
  },

  concernSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    gap: 8,
    paddingHorizontal: 2,
  },

  concernSummaryPillEmergency: {
    flex: 0.92,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(215, 25, 32, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  concernSummaryPillNormal: {
    flex: 1.08,
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  concernSummaryPillActive: {
    borderWidth: 1.4,
    borderColor: "rgba(255, 255, 255, 1)",
  },

  concernSummaryText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.8,
    color: "rgba(255, 255, 255, 1)",
    flexShrink: 1,
  },

  categoryConcernRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 8,
    paddingRight: 2,
  },

  categoryText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
    paddingRight: 4,
  },

  concernPill: {
    height: 21,
    borderRadius: 11,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    flexShrink: 0,
    maxWidth: "48%",
  },

  concernText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.8,
  },

  // --- Filter chips & section row ---
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 10,
  },

  filterPill: {
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  filterPillActive: {
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderColor: "rgba(8, 122, 13, 1)",
  },

  filterText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
  },

  filterTextActive: {
    color: "rgba(255, 255, 255, 1)",
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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

  // --- List, loading & empty states ---
  complaintList: {
    gap: 10,
  },

  loadingCard: {
    minHeight: 160,
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

  // --- Complaint card ---
  complaintCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 13,
    paddingVertical: 13,
  },

  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 9,
  },

  complaintImageWrapper: {
    width: 64,
    height: 58,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(232, 232, 232, 1)",
    marginRight: 11,
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
  },

  complaintId: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10,
    color: "rgba(111, 119, 111, 1)",
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
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 2,
  },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
  },

  detailText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 10.8,
    color: "rgba(111, 119, 111, 1)",
    marginLeft: 7,
  },

  // --- Card footer: status badge & actions ---
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 11,
  },

  statusBadge: {
    minWidth: 105,
    height: 27,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.4,
  },

  validateButton: {
    minWidth: 88,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  validateButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(255, 255, 255, 1)",
  },

  validatedButton: {
    minWidth: 94,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(230, 232, 230, 1)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  validatedButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
  },

  viewRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  viewText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
    marginRight: 2,
  },

  // --- Bottom nav ---
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

  // --- Modals: overlay, sheets, header ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },

  validationSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 12,
    overflow: "hidden",
  },

  validationScrollContent: {
    flexGrow: 0,
    paddingBottom: 4,
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

  // --- Details modal: photos, info, timeline ---
  detailsImage: {
    width: "100%",
    height: 155,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "rgba(232, 232, 232, 1)",
    marginBottom: 12,
  },

  detailsPhotoRow: {
    gap: 10,
    paddingRight: 8,
    marginBottom: 12,
  },

  detailsGalleryPhoto: {
    width: 168,
    height: 155,
    borderRadius: 16,
    backgroundColor: "rgba(232, 232, 232, 1)",
  },

  detailsValidationPhotosBox: {
    marginBottom: 8,
  },

  detailsComplaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "rgba(23, 23, 23, 1)",
  },

  detailsDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(51, 51, 51, 1)",
    lineHeight: 18,
    marginTop: 5,
    marginBottom: 12,
  },

  detailsInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
  },

  detailsLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 5,
  },

  detailsValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(23, 23, 23, 1)",
    lineHeight: 16,
  },

  timelineTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 8,
  },

  timelineBox: {
    marginBottom: 16,
  },

  timelineRow: {
    flexDirection: "row",
  },

  timelineIndicatorBox: {
    width: 28,
    alignItems: "center",
  },

  timelineCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  timelineCircleDone: {
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderColor: "rgba(8, 122, 13, 1)",
  },

  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: "rgba(226, 231, 224, 1)",
    marginVertical: 3,
  },

  timelineLineDone: {
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  timelineTextBox: {
    flex: 1,
    paddingBottom: 14,
  },

  timelineStep: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
  },

  timelineStepDone: {
    color: "rgba(23, 23, 23, 1)",
  },

  timelineTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 1,
  },

  // --- Details modal: validate buttons ---
  detailsValidateButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(8, 122, 13, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  detailsValidateText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(255, 255, 255, 1)",
    marginLeft: 8,
  },

  detailsValidatedButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(230, 232, 230, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  detailsValidatedText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: "rgba(111, 119, 111, 1)",
    marginLeft: 8,
  },

  // --- Validation modal: intro, answer, feedback ---
  validationIntro: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(51, 51, 51, 1)",
    lineHeight: 18,
    marginBottom: 12,
  },

  validationComplaintBox: {
    borderRadius: 14,
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
  },

  validationComplaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: "rgba(23, 23, 23, 1)",
  },

  validationComplaintLocation: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 2,
  },

  inputLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 7,
  },

  answerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 13,
  },

  answerButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  answerButtonActive: {
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderColor: "rgba(8, 122, 13, 1)",
  },

  answerButtonDanger: {
    backgroundColor: "rgba(215, 25, 32, 1)",
    borderColor: "rgba(215, 25, 32, 1)",
  },

  answerText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "rgba(8, 122, 13, 1)",
  },

  answerTextActive: {
    color: "rgba(255, 255, 255, 1)",
  },

  feedbackInput: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 13,
  },

  feedbackInputNoOutline: {
    outlineStyle: "none",
  },

  // --- Validation modal: photo evidence ---
  photoUploadBox: {
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 15,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  emptyPhotoUpload: {
    width: "100%",
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
  },

  photoUploadText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11.5,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 6,
  },

  photoRulesText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 9.5,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    marginTop: 6,
  },

  selectedPhotosSection: {
    width: "100%",
    alignItems: "center",
  },

  selectedCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 9,
  },

  validationPhotoRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 9,
    flexWrap: "wrap",
  },

  validationPhotoBox: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(232, 232, 232, 1)",
  },

  validationPhotoPreview: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  removePhotoButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(215, 25, 32, 0.9)",
    alignItems: "center",
    justifyContent: "center",
  },

  blurPhotoButton: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(8, 122, 13, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },

  addMorePhotoButton: {
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(234, 246, 228, 1)",
    paddingHorizontal: 12,
    marginTop: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },

  addMorePhotoText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Validation modal: submit button ---
  submitValidationButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  submitValidationButtonDisabled: {
    opacity: 0.65,
  },

  submitValidationText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(255, 255, 255, 1)",
  },
});
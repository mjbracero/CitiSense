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
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

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
const MAX_VALIDATION_PHOTOS = 3;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const COMPLAINT_PHOTOS_BUCKET = "complaint-photos";
const CITIZEN_COMPLAINTS_LAST_FILTER_KEY = "citizen.complaints.lastFilter";

function citizenComplaintsCacheKey(filter) {
  return `citizen.complaints:${filter || "All"}`;
}

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

      // Skip citizen validation uploads stored in the same folder.
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

  // Fallback: list validation-* files from the complaint storage folder.
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

function getStatusStyle(status) {
  if (status === "Pending") {
    return {
      bg: "#E8EEFF",
      color: BLUE,
      icon: "clock-outline",
    };
  }

  if (status === "In Progress") {
    return {
      bg: "#FFF8D6",
      color: "#C9A000",
      icon: "progress-wrench",
    };
  }

  if (status === "For Validation") {
    return {
      bg: "#F3EAFF",
      color: "#7A3EA8",
      icon: "clipboard-check-outline",
    };
  }

  if (status === "Completed") {
    return {
      bg: "#DFF0DF",
      color: GREEN,
      icon: "check-circle-outline",
    };
  }

  if (status === "Returned") {
    return {
      bg: "#FFF0F0",
      color: RED,
      icon: "arrow-u-left-top",
    };
  }

  return {
    bg: "#F1F1F1",
    color: MUTED,
    icon: "file-document-outline",
  };
}

function getPriorityStyle(priority) {
  if (priority === "High") {
    return {
      bg: "#FFF2E8",
      color: ORANGE,
    };
  }

  if (priority === "Critical" || priority === "Urgent") {
    return {
      bg: "#FFF0F0",
      color: RED,
    };
  }

  if (priority === "Low") {
    return {
      bg: "#F1F4F1",
      color: MUTED,
    };
  }

  return {
    bg: LIGHT_GREEN,
    color: GREEN,
  };
}

function getConcernStyle(concernType) {
  if (concernType === "Emergency") {
    return {
      bg: "#FFF0F0",
      color: RED,
      icon: "alert-triangle",
    };
  }

  return {
    bg: LIGHT_GREEN,
    color: GREEN,
    icon: "check-circle",
  };
}

function isValidImageFormat(asset) {
  const mimeType = asset.mimeType?.toLowerCase() || "";
  const uri = asset.uri?.toLowerCase() || "";
  const fileName = asset.fileName?.toLowerCase() || "";

  const validMime =
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/jpg" ||
    mimeType === "image/heic" ||
    mimeType === "image/heif";

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

export default function CitizenComplaints() {
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
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useHideBottomNav(detailsVisible || validationVisible);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

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

  useFocusEffect(
    useCallback(() => {
      loadComplaints();
    }, [loadComplaints])
  );

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
      const validSize = !asset.fileSize || Number(asset.fileSize) <= MAX_PHOTO_SIZE;

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

    if (invalidFormatCount > 0 || invalidSizeCount > 0 || failedPrepareCount > 0) {
      notify(
        "Some Photos Were Not Added",
        "Only PNG, JPG, JPEG, HEIC, and HEIF files are allowed, with a maximum size of 10MB per photo."
      );
    }

    if (validAssets.length === 0) return;

    setValidationPhotos((prev) =>
      [...prev, ...validAssets].slice(0, MAX_VALIDATION_PHOTOS)
    );
  };

  const openCameraForValidationPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (permission.status !== "granted") {
        notify(
          "Permission Needed",
          "Please allow camera access so you can take validation evidence photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;

      await addValidationPhotoAssets(result.assets);
    } catch (error) {
      console.log("Validation camera error:", error);
      notify(
        "Camera Error",
        "The app could not open the camera. Please try again or choose a photo from your gallery."
      );
    }
  };

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

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        notify(
          "Permission Needed",
          "Please allow photo access so you can upload validation evidence."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remainingSlots,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length) return;

      await addValidationPhotoAssets(result.assets);
    } catch (error) {
      console.log("Validation gallery error:", error);
      notify(
        "Photo Error",
        "The app could not open or load the selected photo. Please try again."
      );
    }
  };

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

  if (!fontsLoaded && !cachedComplaintsPage) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View style={styles.mainContainer}>
        <View style={styles.stickyHeader}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>My Complaints</Text>
            <Text style={styles.headerDescription}>
              Monitor complaint status and validate resolved reports.
            </Text>
          </View>

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

          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryIconCircle}>
                <MaterialCommunityIcons
                  name="file-document-multiple-outline"
                  size={28}
                  color={WHITE}
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
                <Feather name="alert-triangle" size={12} color={WHITE} />
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
                <Feather name="check-circle" size={12} color={WHITE} />
                <Text style={styles.concernSummaryText} numberOfLines={1}>
                  {nonEmergencyCount} Non-Emergency
                </Text>
              </TouchableOpacity>
            </View>
          </View>

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
          {loadingComplaints && complaintsData.length === 0 ? (
            <ComplaintListSkeleton count={COMPLAINTS_PAGE_SIZE} />
          ) : filteredComplaints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={38} color={MUTED} />
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
                    </TouchableOpacity>

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
                            color={MUTED}
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
                          <Feather name="chevron-right" size={16} color={GREEN} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <ComplaintsLoadMoreFooter loading={loadingMoreComplaints} />
        </ScrollView>


        <Modal
          visible={detailsVisible}
          animationType="slide"
          transparent
          onRequestClose={closeDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Complaint Details</Text>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}
                  onPress={closeDetails}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              {selectedComplaint && (
                <ScrollView showsVerticalScrollIndicator={false}>
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

                  <Text style={styles.detailsComplaintTitle}>
                    {selectedComplaint.title}
                  </Text>

                  <Text style={styles.detailsDescription}>
                    {selectedComplaint.description}
                  </Text>

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
                              <Feather name="check" size={11} color={WHITE} />
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

                  {canCitizenSubmitValidation(selectedComplaint) ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.detailsValidateButton}
                      onPress={() => openValidation(selectedComplaint)}
                    >
                      <Ionicons name="camera-outline" size={21} color={WHITE} />
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
                        color={MUTED}
                      />
                      <Text style={styles.detailsValidatedText}>
                        Validated — waiting for admin review
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              )}
            </View>

            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && detailsVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

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
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

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
                          color={validationAnswer === "resolved" ? WHITE : GREEN}
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
                            validationAnswer === "not_resolved" ? WHITE : RED
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

                    <Text style={styles.inputLabel}>Feedback</Text>

                    <TextInput
                      style={[
                        styles.feedbackInput,
                        Platform.OS === "android" && styles.feedbackInputNoOutline,
                      ]}
                      value={feedback}
                      onChangeText={setFeedback}
                      placeholder="Write your feedback here..."
                      placeholderTextColor="#9A9A9A"
                      multiline
                      textAlignVertical="top"
                    />

                    <Text style={styles.inputLabel}>Photo Evidence</Text>

                    <View style={styles.photoUploadBox}>
                      {validationPhotos.length === 0 ? (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={styles.emptyPhotoUpload}
                          onPress={pickValidationPhoto}
                        >
                          <Ionicons name="camera" size={32} color={GREEN} />

                          <Text style={styles.photoUploadText}>
                            Add validation photo
                          </Text>

                          <Text style={styles.photoRulesText}>
                            Camera or gallery • Up to 3 photos • JPG, PNG, HEIC •
                            Max 10MB each
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.selectedPhotosSection}>
                          <Text style={styles.selectedCountText}>
                            {validationPhotos.length}/3 photo
                            {validationPhotos.length > 1 ? "s" : ""} selected
                          </Text>

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
                                  style={styles.removePhotoButton}
                                  onPress={() => removeValidationPhoto(photo.id)}
                                >
                                  <Ionicons
                                    name="close"
                                    size={13}
                                    color={WHITE}
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
                                color={GREEN}
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
                        <ActivityIndicator size="small" color={WHITE} />
                      ) : (
                        <Text style={styles.submitValidationText}>
                          Submit Validation
                        </Text>
                      )}
                    </TouchableOpacity>
                </KeyboardAwareScrollView>
              )}
            </View>

            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && validationVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        <FullscreenPhotoViewer
          visible={
            photoViewerVisible && !detailsVisible && !validationVisible
          }
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
    backgroundColor: WHITE,
  },

  mainContainer: {
    flex: 1,
    backgroundColor: BG,
  },

  stickyHeader: {
    backgroundColor: BG,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    zIndex: 2,
  },

  listScroll: {
    flex: 1,
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
    marginTop: 6,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: GREEN,
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    marginTop: -2,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  summaryCard: {
    borderRadius: 18,
    backgroundColor: GREEN,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
    shadowColor: "#000000",
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
    color: WHITE,
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
    backgroundColor: RED,
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
    borderColor: WHITE,
  },

  concernSummaryText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.8,
    color: WHITE,
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
    color: GREEN,
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
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  filterPillActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  filterText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: MUTED,
  },

  filterTextActive: {
    color: WHITE,
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
    color: GREEN,
  },

  sectionCount: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
  },

  complaintList: {
    gap: 10,
  },


  loadingCard: {
    minHeight: 160,
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

  complaintCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
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
    backgroundColor: "#E8E8E8",
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
    fontSize: 14,
    color: TEXT,
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
    color: MUTED,
    marginLeft: 7,
  },

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
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  validateButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: WHITE,
  },

  validatedButton: {
    minWidth: 94,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E6E8E6",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },

  validatedButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: MUTED,
  },

  viewRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  viewText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
    marginRight: 2,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "86%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
  },

  validationSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
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

  detailsImage: {
    width: "100%",
    height: 155,
    borderRadius: 16,
    resizeMode: "cover",
    backgroundColor: "#E8E8E8",
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
    backgroundColor: "#E8E8E8",
  },

  detailsValidationPhotosBox: {
    marginBottom: 8,
  },

  detailsComplaintTitle: {
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
    paddingVertical: 11,
    marginBottom: 13,
  },

  detailsLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
    marginTop: 5,
  },

  detailsValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 16,
  },

  timelineTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: GREEN,
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
    marginVertical: 3,
  },

  timelineLineDone: {
    backgroundColor: GREEN,
  },

  timelineTextBox: {
    flex: 1,
    paddingBottom: 14,
  },

  timelineStep: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: MUTED,
  },

  timelineStepDone: {
    color: TEXT,
  },

  timelineTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
  },

  detailsValidateButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  detailsValidateText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: WHITE,
    marginLeft: 8,
  },

  detailsValidatedButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "#E6E8E6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  detailsValidatedText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: MUTED,
    marginLeft: 8,
  },

  validationIntro: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginBottom: 12,
  },

  validationComplaintBox: {
    borderRadius: 14,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
  },

  validationComplaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.5,
    color: TEXT,
  },

  validationComplaintLocation: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },

  inputLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
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
    borderColor: BORDER,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },

  answerButtonActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },

  answerButtonDanger: {
    backgroundColor: RED,
    borderColor: RED,
  },

  answerText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
  },

  answerTextActive: {
    color: WHITE,
  },

  feedbackInput: {
    minHeight: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: TEXT,
    marginBottom: 13,
  },

  feedbackInputNoOutline: {
    outlineStyle: "none",
  },

  photoUploadBox: {
    minHeight: 132,
    borderRadius: 16,
    borderWidth: 1.2,
    borderStyle: "dashed",
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
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
    color: GREEN,
    marginTop: 6,
  },

  photoRulesText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 9.5,
    color: MUTED,
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
    color: GREEN,
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
    backgroundColor: "#E8E8E8",
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

  addMorePhotoButton: {
    height: 30,
    borderRadius: 15,
    backgroundColor: LIGHT_GREEN,
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
    color: GREEN,
  },

  submitValidationButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  submitValidationButtonDisabled: {
    opacity: 0.65,
  },

  submitValidationText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: WHITE,
  },
});
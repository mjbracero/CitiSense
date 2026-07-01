import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as ImagePicker from "expo-image-picker";
import {
  useFocusEffect,
  useLocalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import {
  getProfileDisplayName,
  notifyAdminsCitizenValidated,
} from "../../lib/adminNotificationService";
import { supabase } from "../../lib/supabase";

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

const VALIDATION_BUCKET = "validation-photos";

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

const filters = ["All", "Pending", "In Progress", "For Validation", "Completed"];

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
  "waste & environmental": "Waste and Environmental Concerns",
  "traffic & road safety": "Traffic and Road Safety Concerns",
  "fire safety": "Fire Safety Concerns",
  "city facility": "City Facility Concerns",
};

const categoryKeywords = [
  {
    category: "Fire Safety Concerns",
    keywords: [
      "fire",
      "sunog",
      "smoke",
      "aso",
      "burning",
      "nasunog",
      "flame",
      "apoy",
      "gas leak",
      "lpg",
      "leaking gas",
      "explosion",
      "fire hazard",
      "spark",
      "electrical fire",
      "bfp",
    ],
  },
  {
    category: "Disaster and Emergency Concerns",
    keywords: [
      "disaster",
      "emergency",
      "rescue",
      "landslide",
      "earthquake",
      "linog",
      "storm",
      "bagyo",
      "collapsed",
      "evacuation",
      "calamity",
      "drowning",
      "drown",
      "nalumos",
      "lunod",
      "trapped",
      "missing person",
    ],
  },
  {
    category: "Peace and Order Concerns",
    keywords: [
      "crime",
      "fight",
      "riot",
      "police",
      "thief",
      "stealing",
      "robbery",
      "kawat",
      "gubot",
      "violence",
      "threat",
      "drunk",
      "noise complaint",
      "public disturbance",
      "shooting",
      "stab",
      "stabbing",
      "gun",
      "murder",
      "killing",
      "attack",
      "hostage",
      "vandalism",
    ],
  },
  {
    category: "Water Concerns",
    keywords: [
      "water",
      "tubig",
      "leak",
      "leaking",
      "pipe",
      "broken pipe",
      "faucet",
      "gripo",
      "low pressure",
      "no water",
      "walay tubig",
      "dirty water",
      "contaminated water",
      "water interruption",
      "burst pipe",
    ],
  },
  {
    category: "Electricity Concerns",
    keywords: [
      "electricity",
      "power",
      "brownout",
      "blackout",
      "kuryente",
      "wire",
      "live wire",
      "exposed wire",
      "electrical",
      "transformer",
      "power outage",
      "walay kuryente",
      "electric post",
      "fallen electric post",
      "power line",
      "sparking wire",
    ],
  },
  {
    category: "Streetlight Concerns",
    keywords: [
      "streetlight",
      "street light",
      "poste",
      "lamp post",
      "suga",
      "light not working",
      "dark road",
      "broken light",
      "no light",
      "pundido",
      "pundir",
      "flickering light",
      "damaged lamp",
    ],
  },
  {
    category: "Road and Infrastructure Concerns",
    keywords: [
      "road",
      "dalan",
      "pothole",
      "potholes",
      "damaged road",
      "broken road",
      "asphalt",
      "bridge",
      "sidewalk",
      "crack",
      "road repair",
      "infrastructure",
      "uneven road",
      "manhole",
      "road shoulder",
      "culvert",
      "barrier",
      "guardrail",
    ],
  },
  {
    category: "Drainage and Flooding Concerns",
    keywords: [
      "drainage",
      "canal",
      "clogged",
      "barado",
      "flood",
      "flooding",
      "baha",
      "overflow",
      "sewer",
      "water flow",
      "blocked drainage",
      "stagnant water",
      "canal overflow",
      "standing water",
      "storm drain",
    ],
  },
  {
    category: "Waste and Environmental Concerns",
    keywords: [
      "garbage",
      "trash",
      "waste",
      "basura",
      "illegal dumping",
      "dirty area",
      "environment",
      "pollution",
      "bad smell",
      "odor",
      "litter",
      "uncollected garbage",
      "open dumping",
      "burning garbage",
      "hazardous waste",
    ],
  },
  {
    category: "Traffic and Road Safety Concerns",
    keywords: [
      "traffic",
      "road safety",
      "accident",
      "crash",
      "vehicle",
      "parking",
      "illegal parking",
      "reckless driving",
      "speeding",
      "crosswalk",
      "traffic sign",
      "traffic light",
      "road obstruction",
      "blocked lane",
      "pedestrian",
      "motorcycle accident",
      "tricycle accident",
    ],
  },
  {
    category: "Transport Terminal Concerns",
    keywords: [
      "terminal",
      "bus terminal",
      "van terminal",
      "jeepney terminal",
      "bus",
      "jeepney",
      "van",
      "fare",
      "driver",
      "transport",
      "commuter",
      "overcharging fare",
      "passenger queue",
    ],
  },
  {
    category: "Port Concerns",
    keywords: [
      "port",
      "pier",
      "polambato",
      "boat",
      "barko",
      "ferry",
      "ship",
      "dock",
      "passenger port",
      "cargo",
      "wharf",
    ],
  },
  {
    category: "Health and Sanitation Concerns",
    keywords: [
      "health",
      "sanitation",
      "clinic",
      "medical",
      "hospital",
      "disease",
      "illness",
      "food poisoning",
      "dirty food",
      "public toilet",
      "comfort room",
      "unsanitary",
      "septic",
      "mosquito",
      "dengue",
      "contamination",
    ],
  },
  {
    category: "Animal Concerns",
    keywords: [
      "animal",
      "dog",
      "cat",
      "stray",
      "bite",
      "dog bite",
      "iro",
      "iring",
      "rabies",
      "dead animal",
      "loose dog",
      "aggressive dog",
      "livestock",
      "cow",
      "pig",
      "goat",
      "chicken",
    ],
  },
  {
    category: "Building and Construction Concerns",
    keywords: [
      "building",
      "construction",
      "unsafe structure",
      "permit",
      "renovation",
      "demolition",
      "construction site",
      "falling debris",
      "illegal construction",
      "scaffold",
      "excavation",
    ],
  },
  {
    category: "Planning and Zoning Concerns",
    keywords: [
      "zoning",
      "planning",
      "land use",
      "property boundary",
      "setback",
      "illegal structure",
      "wrong land use",
      "zoning violation",
      "lot boundary",
    ],
  },
  {
    category: "Public Market Concerns",
    keywords: [
      "market",
      "public market",
      "merkado",
      "stall",
      "vendor",
      "wet market",
      "market drainage",
      "market garbage",
      "overpricing",
      "market sanitation",
    ],
  },
  {
    category: "Public Plaza Concerns",
    keywords: [
      "plaza",
      "public plaza",
      "park",
      "playground",
      "bench",
      "public garden",
      "damaged plaza",
      "plaza light",
      "fountain",
    ],
  },
  {
    category: "City Facility Concerns",
    keywords: [
      "city facility",
      "city hall",
      "gym",
      "covered court",
      "barangay hall",
      "public building",
      "facility",
      "sports complex",
      "multi-purpose hall",
      "public restroom",
    ],
  },
  {
    category: "Tourism Site / Public Attraction Concerns",
    keywords: [
      "tourism",
      "tourist",
      "attraction",
      "tourist spot",
      "public attraction",
      "heritage",
      "beach attraction",
      "site",
      "tourism site",
      "landmark",
    ],
  },
  {
    category: "Coastal and Marine Protection Concerns",
    keywords: [
      "coastal",
      "marine",
      "sea",
      "dagat",
      "illegal fishing",
      "shore",
      "shoreline",
      "mangrove",
      "fish kill",
      "coral",
      "bantay dagat",
      "coastal waste",
      "seawater",
      "beach waste",
    ],
  },
  {
    category: "PWD Accessibility Concerns",
    keywords: [
      "pwd",
      "accessibility",
      "disabled",
      "disability",
      "ramp",
      "wheelchair",
      "handrail",
      "accessible",
      "blind",
      "deaf",
      "senior access",
      "blocked ramp",
    ],
  },
];

const criticalKeywords = [
  "fire",
  "sunog",
  "gas leak",
  "lpg",
  "explosion",
  "shooting",
  "gun",
  "stab",
  "stabbing",
  "murder",
  "killing",
  "hostage",
  "bleeding",
  "unconscious",
  "drowning",
  "nalumos",
  "lunod",
  "landslide",
  "earthquake",
  "collapsed",
  "live wire",
  "exposed wire",
  "fallen electric post",
  "electric shock",
  "rescue",
  "emergency",
  "life threatening",
];

const highKeywords = [
  "accident",
  "crash",
  "flood",
  "flooding",
  "baha",
  "blocked road",
  "road obstruction",
  "pothole",
  "potholes",
  "damaged road",
  "bridge damage",
  "no water",
  "walay tubig",
  "no electricity",
  "walay kuryente",
  "power outage",
  "contaminated water",
  "dirty water",
  "dog bite",
  "rabies",
  "aggressive dog",
  "unsafe structure",
  "falling debris",
  "clogged drainage",
  "overflow",
  "septic",
  "dengue",
  "public health",
];

const lowKeywords = [
  "minor",
  "small",
  "paint",
  "bench",
  "faded",
  "signage",
  "request",
  "cleaning",
  "trim",
  "grass",
  "cosmetic",
];

function normalizeCategory(category) {
  if (!category) return "Unclassified";

  const cleanCategory = String(category).trim();

  if (CATEGORY_DEPARTMENT_MAP[cleanCategory]) return cleanCategory;

  const lowerCategory = cleanCategory.toLowerCase();

  if (CATEGORY_ALIASES[lowerCategory]) return CATEGORY_ALIASES[lowerCategory];

  const matchedCategory = Object.keys(CATEGORY_DEPARTMENT_MAP).find(
    (item) =>
      item.toLowerCase().includes(lowerCategory) ||
      lowerCategory.includes(item.toLowerCase().replace(" concerns", ""))
  );

  return matchedCategory || cleanCategory || "Unclassified";
}

function detectComplaintCategory(title = "", description = "") {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();

  for (const item of categoryKeywords) {
    const matched = item.keywords.some((keyword) =>
      combinedText.includes(keyword.toLowerCase())
    );

    if (matched) return item.category;
  }

  return "Unclassified";
}

function getAssignedOffice(category, existingOffice) {
  if (
    existingOffice &&
    String(existingOffice).trim() &&
    String(existingOffice).trim() !== "Unassigned"
  ) {
    return String(existingOffice).trim();
  }

  const normalizedCategory = normalizeCategory(category);

  return CATEGORY_DEPARTMENT_MAP[normalizedCategory] || "Unassigned";
}

function calculatePriority(title = "", description = "", isEmergency = false) {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();

  if (
    isEmergency ||
    criticalKeywords.some((keyword) => combinedText.includes(keyword))
  ) {
    return "Critical";
  }

  if (highKeywords.some((keyword) => combinedText.includes(keyword))) {
    return "High";
  }

  if (lowKeywords.some((keyword) => combinedText.includes(keyword))) {
    return "Low";
  }

  return "Normal";
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

  const detectedCategory = detectComplaintCategory(row.title, row.description);

  const category =
    !row.category ||
    row.category === "Unclassified" ||
    row.category === "Unassigned"
      ? detectedCategory
      : normalizeCategory(row.category || row.concern_category);

  const assignedOffice = getAssignedOffice(
    category,
    row.assigned_office || row.assignedOffice || row.department
  );

  const priority = calculatePriority(
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
    validationSubmitted: getValidationSubmitted(row),
    validationResult: getValidationResult(row),
    validationFeedback: getValidationFeedback(row),
    validationPhotoUrls: normalizeValidationPhotoUrls(
      row.citizen_validation_photo_urls ||
        row.validation_photo_urls ||
        row.citizen_feedback_photo_urls
    ),
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
      bg: "#FFF2C2",
      color: "#A97700",
      icon: "progress-wrench",
    };
  }

  if (status === "For Validation") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      icon: "camera-check-outline",
    };
  }

  if (status === "Completed") {
    return {
      bg: LIGHT_GREEN,
      color: GREEN,
      icon: "check-circle-outline",
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

  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    uri.endsWith(".jpg") ||
    uri.endsWith(".jpeg") ||
    uri.endsWith(".png") ||
    fileName.endsWith(".jpg") ||
    fileName.endsWith(".jpeg") ||
    fileName.endsWith(".png")
  );
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

  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpeg")) return "jpeg";

  return "jpg";
}

async function uploadValidationPhotos(complaintId, photos = []) {
  const uploadedPaths = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const extension = getValidationFileExtension(photo);
    const storagePath = `${complaintId}/validation-${Date.now()}-${index}.${extension}`;

    const response = await fetch(photo.uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from(VALIDATION_BUCKET)
      .upload(storagePath, blob, {
        contentType: photo.mimeType || "image/jpeg",
        upsert: true,
      });

    if (error) {
      throw error;
    }

    uploadedPaths.push(storagePath);
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

  const [complaintsData, setComplaintsData] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [autoOpenedComplaintId, setAutoOpenedComplaintId] = useState(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [validationVisible, setValidationVisible] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [validationPhotos, setValidationPhotos] = useState([]);
  const [validationAnswer, setValidationAnswer] = useState(null);
  const [submittingValidation, setSubmittingValidation] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const loadComplaints = useCallback(async () => {
    try {
      setLoadingComplaints(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setCurrentUserId(null);
        setComplaintsData([]);
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("complaints")
        .select("*")
        .eq("citizen_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        Alert.alert("Load Failed", error.message);
        setComplaintsData([]);
        return;
      }

      const routedRows = (data || []).map((row) => {
        const detectedCategory = detectComplaintCategory(row.title, row.description);

        const fixedCategory =
          !row.category ||
          row.category === "Unclassified" ||
          row.category === "Unassigned"
            ? detectedCategory
            : normalizeCategory(row.category || row.concern_category);

        const fixedOffice = getAssignedOffice(
          fixedCategory,
          row.assigned_office || row.assignedOffice || row.department
        );

        const fixedPriority = calculatePriority(
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
          const shouldUpdate =
            row.category !== data?.find((item) => item.id === row.id)?.category ||
            row.assigned_office !==
              data?.find((item) => item.id === row.id)?.assigned_office ||
            row.priority !== data?.find((item) => item.id === row.id)?.priority;

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

      const mappedComplaints = await Promise.all(
        routedRows.map((row) => mapDatabaseComplaint(row))
      );

      setComplaintsData(mappedComplaints);
    } catch (error) {
      console.log("Load complaints error:", error);
      Alert.alert("Load Failed", "Unable to load complaints.");
      setComplaintsData([]);
    } finally {
      setLoadingComplaints(false);
    }
  }, []);

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
          loadComplaints();
        }
      )
      .subscribe((status) => {
        console.log("Citizen complaints realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadComplaints]);

  const emergencyCount = useMemo(
    () =>
      complaintsData.filter((item) => item.concernType === "Emergency").length,
    [complaintsData]
  );

  const nonEmergencyCount = useMemo(
    () =>
      complaintsData.filter((item) => item.concernType === "Non-Emergency")
        .length,
    [complaintsData]
  );

  const sortedComplaintsData = useMemo(() => {
    return [...complaintsData].sort(
      (a, b) => parseSubmittedAt(b.submittedAt) - parseSubmittedAt(a.submittedAt)
    );
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
      setDetailsVisible(true);
      setActiveFilter("All");
      setAutoOpenedComplaintId(targetComplaintId);
    }
  }, [
    autoOpenedComplaintId,
    loadingComplaints,
    sortedComplaintsData,
    targetComplaintId,
  ]);

  const openDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setDetailsVisible(true);
  };

  const openValidation = (complaint) => {
    Keyboard.dismiss();

    if (complaint?.validationSubmitted) {
      Alert.alert(
        "Already Validated",
        "You already submitted your validation feedback for this complaint. Please wait for the admin review."
      );
      return;
    }

    setSelectedComplaint(complaint);
    setFeedback("");
    setValidationPhotos([]);
    setValidationAnswer(null);
    setDetailsVisible(false);
    setValidationVisible(true);
  };

  const pickValidationPhoto = async () => {
    Keyboard.dismiss();

    const remainingSlots = MAX_VALIDATION_PHOTOS - validationPhotos.length;

    if (remainingSlots <= 0) {
      Alert.alert(
        "Photo Limit Reached",
        "You can only upload up to 3 validation photos."
      );
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permission.status !== "granted") {
      Alert.alert(
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

    if (result.canceled) return;

    let invalidFormatCount = 0;
    let invalidSizeCount = 0;

    const validAssets = result.assets
      .filter((asset) => {
        const validFormat = isValidImageFormat(asset);
        const validSize =
          !asset.fileSize || Number(asset.fileSize) <= MAX_PHOTO_SIZE;

        if (!validFormat) invalidFormatCount += 1;
        if (!validSize) invalidSizeCount += 1;

        return validFormat && validSize;
      })
      .map((asset) => ({
        id: `${asset.uri}-${Date.now()}-${Math.random()}`,
        uri: asset.uri,
        fileName: asset.fileName || "Validation photo",
        fileSize: asset.fileSize || 0,
        mimeType: asset.mimeType || "image/jpeg",
      }));

    if (invalidFormatCount > 0 || invalidSizeCount > 0) {
      Alert.alert(
        "Some Photos Were Not Added",
        "Only PNG, JPG, and JPEG files are allowed, with a maximum size of 10MB per photo."
      );
    }

    if (validAssets.length === 0) return;

    setValidationPhotos((prev) =>
      [...prev, ...validAssets].slice(0, MAX_VALIDATION_PHOTOS)
    );
  };

  const removeValidationPhoto = (photoId) => {
    setValidationPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
  };

  const submitValidation = async () => {
    Keyboard.dismiss();

    if (submittingValidation) return;

    if (!selectedComplaint?.id) {
      Alert.alert("Validation Failed", "Complaint record was not found.");
      return;
    }

    if (!validationAnswer) {
      Alert.alert(
        "Validation Required",
        "Please choose whether the issue was resolved or not."
      );
      return;
    }

    if (!feedback.trim()) {
      Alert.alert(
        "Feedback Required",
        "Please provide your feedback before submitting validation."
      );
      return;
    }

    if (validationPhotos.length === 0) {
      Alert.alert(
        "Photo Evidence Required",
        "Please upload at least one photo evidence to support your validation."
      );
      return;
    }

    try {
      setSubmittingValidation(true);

      const uploadedValidationPhotos = await uploadValidationPhotos(
        selectedComplaint.id,
        validationPhotos
      );

      const validationSubmittedAt = new Date().toISOString();

      const updatePayload = {
        validation_status: "Validated",
        citizen_validation_status: "Validated",
        citizen_validation_answer: validationAnswer,
        citizen_validation_feedback: feedback.trim(),
        citizen_validation_photo_urls: uploadedValidationPhotos,
        citizen_validated_at: validationSubmittedAt,
      };

      const { error } = await supabase
        .from("complaints")
        .update(updatePayload)
        .eq("id", selectedComplaint.id);

      if (error) {
        Alert.alert("Validation Failed", error.message);
        return;
      }

      const updatedComplaint = {
        ...selectedComplaint,
        validationSubmitted: true,
        validationResult: validationAnswer,
        validationFeedback: feedback.trim(),
        validationPhotoUrls: uploadedValidationPhotos,
      };

      setComplaintsData((prev) =>
        prev.map((item) =>
          item.id === selectedComplaint.id
            ? {
                ...item,
                validationSubmitted: true,
                validationResult: validationAnswer,
                validationFeedback: feedback.trim(),
                validationPhotoUrls: uploadedValidationPhotos,
              }
            : item
        )
      );

      setSelectedComplaint(updatedComplaint);
      setValidationVisible(false);
      setFeedback("");
      setValidationPhotos([]);
      setValidationAnswer(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const citizenName = await getProfileDisplayName(user?.id);

      await notifyAdminsCitizenValidated({
        complaint: {
          id: selectedComplaint.id,
          short_id: selectedComplaint.shortId,
          title: selectedComplaint.title,
          category: selectedComplaint.category,
          assigned_office: selectedComplaint.assignedOffice,
          location_text: selectedComplaint.location,
          status: selectedComplaint.status,
        },
        validationAnswer,
        citizenName,
      });

      Alert.alert(
        "Validation Submitted",
        validationAnswer === "resolved"
          ? "Thank you. Your feedback was submitted. The admin will review it before marking the complaint as completed."
          : "Thank you. Your feedback was submitted. The admin will review it and may return the complaint to the department if further action is needed."
      );

      await loadComplaints();
    } catch (error) {
      console.log("Submit validation error:", error);
      Alert.alert(
        "Validation Failed",
        error?.message || "Unable to submit validation feedback."
      );
    } finally {
      setSubmittingValidation(false);
    }
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
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View style={styles.mainContainer}>
        <View style={styles.header}>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>My Complaints</Text>
            <Text style={styles.headerDescription}>
              Monitor complaint status and validate resolved reports.
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconCircle}>
              <MaterialCommunityIcons
                name="file-document-multiple-outline"
                size={28}
                color={WHITE}
              />
            </View>

            <View style={styles.summaryTextBox}>
              <Text style={styles.summaryTitle}>
                {loadingComplaints
                  ? "Loading complaints..."
                  : `${complaintsData.length} submitted complaints`}
              </Text>
              <Text style={styles.summarySubtitle}>
                Track each report from submission to final resolution.
              </Text>

              <View style={styles.concernSummaryRow}>
                <TouchableOpacity
                  activeOpacity={0.78}
                  style={[
                    styles.concernSummaryPillEmergency,
                    activeFilter === "All Emergency" &&
                      styles.concernSummaryPillActive,
                  ]}
                  onPress={() => setActiveFilter("All Emergency")}
                >
                  <Feather name="alert-triangle" size={15} color={WHITE} />
                  <Text style={styles.concernSummaryText}>
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
                  onPress={() => setActiveFilter("All Non-Emergency")}
                >
                  <Feather name="check-circle" size={15} color={WHITE} />
                  <Text style={styles.concernSummaryText}>
                    {nonEmergencyCount} Non-Emergency
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {filters.map((filter) => {
              const isActive = activeFilter === filter;

              return (
                <TouchableOpacity
                  key={filter}
                  activeOpacity={0.75}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setActiveFilter(filter)}
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

          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Complaint Records</Text>
            <Text style={styles.sectionCount}>
              {loadingComplaints
                ? "Loading..."
                : `${filteredComplaints.length} shown`}
            </Text>
          </View>

          {loadingComplaints ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.loadingText}>Loading complaints...</Text>
            </View>
          ) : filteredComplaints.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={38} color={MUTED} />
              <Text style={styles.emptyTitle}>No submitted complaints yet</Text>
              <Text style={styles.emptyText}>
                Complaints you submit will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.complaintList}>
              {filteredComplaints.map((item) => {
                const statusStyle = getStatusStyle(item.status);
                const priorityStyle = getPriorityStyle(item.priority);
                const concernStyle = getConcernStyle(item.concernType);

                return (
                  <TouchableOpacity
                    key={item.id}
                    activeOpacity={0.78}
                    style={styles.complaintCard}
                    onPress={() => openDetails(item)}
                  >
                    <View style={styles.cardTopRow}>
                      <View style={styles.complaintImageWrapper}>
                        <Image
                          source={{ uri: item.photo }}
                          style={styles.complaintImage}
                        />
                      </View>

                      <View style={styles.complaintInfo}>
                        <View style={styles.idRow}>
                          <Text style={styles.complaintId}>
                            {item.shortId}
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

                      {item.status === "For Validation" ? (
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
                            style={styles.validateButton}
                            onPress={() => openValidation(item)}
                          >
                            <Text style={styles.validateButtonText}>Validate</Text>
                          </TouchableOpacity>
                        )
                      ) : (
                        <View style={styles.viewRow}>
                          <Text style={styles.viewText}>View Details</Text>
                          <Feather name="chevron-right" size={16} color={GREEN} />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomNav}>
          {bottomTabs.map((tab) => {
            const isActive =
              pathname?.includes(tab.activePath) ||
              (tab.label === "My Complaints" &&
                pathname?.includes("citizenComplaints"));

            return (
              <TouchableOpacity
                key={tab.label}
                style={[styles.navItem, { flex: tab.flex }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (isActive) return;
                  router.push(tab.route);
                }}
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
          visible={detailsVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setDetailsVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.detailsSheet}>
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Complaint Details</Text>

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.modalCloseButton}
                  onPress={() => setDetailsVisible(false)}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              {selectedComplaint && (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Image
                    source={{ uri: selectedComplaint.photo }}
                    style={styles.detailsImage}
                  />

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

                  {selectedComplaint.status === "For Validation" && (
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
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.detailsValidateButton}
                        onPress={() => openValidation(selectedComplaint)}
                      >
                        <Ionicons name="camera-outline" size={21} color={WHITE} />
                        <Text style={styles.detailsValidateText}>
                          Provide Feedback & Photo Evidence
                        </Text>
                      </TouchableOpacity>
                    )
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        <Modal
          visible={validationVisible}
          animationType="slide"
          transparent
          onRequestClose={() => {
            Keyboard.dismiss();
            setValidationVisible(false);
          }}
        >
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                      setValidationVisible(false);
                    }}
                  >
                    <Feather name="x" size={21} color={TEXT} />
                  </TouchableOpacity>
                </View>

                {selectedComplaint && (
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={styles.validationScrollContent}
                  >
                    <Text style={styles.validationIntro}>
                      The responsible department marked this complaint as Resolved
                      / For Validation. Please confirm if the issue was properly
                      addressed.
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
                      style={styles.feedbackInput}
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
                            Upload validation photo
                          </Text>

                          <Text style={styles.photoRulesText}>
                            Up to 3 photos • Max 10MB each
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
                                <Image
                                  source={{ uri: photo.uri }}
                                  style={styles.validationPhotoPreview}
                                />

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
                  </ScrollView>
                )}
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
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
    paddingTop: 16,
    paddingBottom: 120,
  },

  summaryCard: {
    borderRadius: 18,
    backgroundColor: GREEN,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 7,
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
  },

  summaryTextBox: {
    flex: 1,
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
    marginTop: 12,
    gap: 9,
  },

  concernSummaryPillEmergency: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
    backgroundColor: RED,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  concernSummaryPillNormal: {
    flex: 1,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  concernSummaryPillActive: {
    borderWidth: 1.4,
    borderColor: WHITE,
  },

  concernSummaryText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: WHITE,
  },

  filterRow: {
    paddingBottom: 14,
    gap: 8,
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
    marginBottom: 10,
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

  categoryConcernRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 6,
  },

  categoryText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: GREEN,
  },

  concernPill: {
    height: 21,
    borderRadius: 11,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  concernText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.8,
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

  keyboardAvoidingOverlay: {
    flex: 1,
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
    paddingBottom: Platform.OS === "ios" ? 20 : 14,
  },

  validationScrollContent: {
    paddingBottom: Platform.OS === "ios" ? 24 : 36,
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
import {
  Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import { ComplaintListSkeleton, PageSkeleton } from "../../components/skeletons";
import ComplaintsLoadMoreFooter from "../../components/ComplaintsLoadMoreFooter";
import FullscreenPhotoViewer from "../../components/FullscreenPhotoViewer";
import { WebView } from "react-native-webview";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { createCitizenNotificationAndPush } from "../../lib/citizenNotificationService";
import {
  notifyAdminsReassignment,
  notifyAdminsValidationRequired,
} from "../../lib/adminNotificationService";
import { notifyDepartmentHeadsReassigned } from "../../lib/departmentHeadNotificationService";
import { writeAuditLog } from "../../lib/auditLogService";
import { isLocationUsageAllowed } from "../../lib/locationPreferences";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
import {
  applyComplaintOffsetFilters,
  applyOffsetPagination,
  COMPLAINTS_PAGE_SIZE,
  getOffsetPageRange,
  isNearContentBottom,
  mergeComplaintPages,
} from "../../lib/complaintPagination";
import {
  complaintAppliesToDepartment,
  CONCERN_DEPARTMENT_OPTIONS,
  getAssignedOffice,
  getCategoriesForDepartment,
} from "../../lib/complaintCategories";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

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
const DEFAULT_DEPARTMENT_HEAD_DEPARTMENT = "";
const DEPT_ASSIGNED_LAST_FILTER_KEY = "departmentHead.assigned.lastFilter";

function assignedComplaintsCacheKey({ category, status, priority }) {
  return `departmentHead.assigned:${category}:${status}:${priority}`;
}

const MAPTILER_API_KEY =
  process.env.EXPO_PUBLIC_MAPTILER_API_KEY || "YvAwnNKyEt5uLWWmRXMN";

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const AVATAR_BUCKET = "avatars";

const statusFilters = [
  "All Status",
  "Assigned",
  "Pending",
  "In Progress",
  "For Validation",
  "Completed",
];

const statusOptions = ["In Progress", "For Validation"];

const priorityFilters = [
  "All Priority",
  "Critical",
  "Urgent",
  "High",
  "Normal",
  "Low",
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

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeStatus(status) {
  const clean = normalizeText(status);

  if (clean === "assigned") return "Assigned";
  if (clean === "pending") return "Pending";
  if (clean === "in_progress" || clean === "in progress") return "In Progress";
  if (clean === "for_validation" || clean === "for validation" || clean === "validation") {
    return "For Validation";
  }
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

  return status || "Assigned";
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

function getStatusStyle(status) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === "Assigned") return { bg: "#E8EEFF", color: BLUE };
  if (normalizedStatus === "Pending" || normalizedStatus === "Assigned") {
    return { bg: "#E8EEFF", color: BLUE };
  }
  if (normalizedStatus === "In Progress") return { bg: "#FFF8D6", color: "#C9A000" };
  if (normalizedStatus === "For Validation") return { bg: "#F3EAFF", color: "#7A3EA8" };
  if (normalizedStatus === "Completed") return { bg: "#DFF0DF", color: GREEN };
  if (normalizedStatus === "Returned") return { bg: "#FFF0F0", color: RED };

  return { bg: "#F1F1F1", color: MUTED };
}

function getPriorityStyle(priority) {
  const normalizedPriority = normalizePriority(priority);

  if (normalizedPriority === "Critical") return { bg: "#FFF0F0", color: RED };
  if (normalizedPriority === "Urgent") return { bg: "#FFF0F0", color: RED };
  if (normalizedPriority === "High") return { bg: "#FFF2E8", color: ORANGE };
  if (normalizedPriority === "Normal") return { bg: LIGHT_GREEN, color: GREEN };
  if (normalizedPriority === "Low") return { bg: "#F1F4F1", color: MUTED };

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

function extractAvatarPath(value) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const signMarker = `/storage/v1/object/sign/${AVATAR_BUCKET}/`;

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  if (!/^https?:\/\//i.test(text)) {
    return text.replace(/^avatars\//, "").replace(/^\/+/, "");
  }

  return null;
}

async function createReadableAvatarUrl(value) {
  if (!value) return null;

  try {
    const rawValue = String(value);

    if (/^https?:\/\//i.test(rawValue)) {
      return rawValue;
    }

    const path = extractAvatarPath(rawValue);

    if (!path) return null;

    const { data: signedData, error: signedError } = await supabase.storage
      .from(AVATAR_BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (!signedError && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    const { data: publicData } = supabase.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);

    return publicData?.publicUrl || null;
  } catch (error) {
    console.log("Resolve avatar error:", error);
    return null;
  }
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

  if (resolvedUrls.length > 0) return resolvedUrls;

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

      if (resolvedUrl) listedUrls.push(resolvedUrl);
    }

    return listedUrls;
  } catch (error) {
    console.log("List complaint photos error:", error);
    return [];
  }
}

async function mapComplaintRow(row, profileMap = {}) {
  const createdAt =
    row.created_at ||
    row.submitted_at ||
    row.submitted_date_time ||
    new Date().toISOString();

  const profile = profileMap[row.citizen_id] || {};
  const uploadedPhotos = await resolveComplaintPhotoUrls(row);

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
    location: row.location || row.barangay || "Location not available",
    geotaggedLocation:
      row.location_text ||
      row.geotagged_location ||
      row.location ||
      "Pinned location not available",
    latitude: row.latitude != null && row.latitude !== "" ? String(row.latitude).trim() : "",
    longitude:
      row.longitude != null && row.longitude !== "" ? String(row.longitude).trim() : "",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    createdAt,
    status: normalizeStatus(row.status || "Assigned"),
    priority: normalizePriority(row.priority, row.is_emergency),
    description: row.description || "No description provided.",
    citizen: row.citizen_name || profile.full_name || "Citizen",
    contact: row.contact_number || profile.contact_number || "No contact number",
    userPhoto: row.user_photo || row.citizen_photo || profile.avatar_url || null,
    reassignmentReason: row.reassignment_reason || row.reassign_reason || "",
    reassignedFromCategory: row.reassigned_from_category || "",
    reassignedFromOffice: row.reassigned_from_office || "",
    reassignedToCategory: row.reassigned_to_category || "",
    reassignedToOffice: row.reassigned_to_office || "",
    reassignedAt: row.reassigned_at || null,
    uploadedPhotos,
    photo: uploadedPhotos[0] || PHOTO_PLACEHOLDER,
  };
}

function escapeCsvCell(value) {
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function buildComplaintsCsv(rows = []) {
  const headers = [
    "Complaint ID",
    "Title",
    "Category",
    "Department",
    "Status",
    "Priority",
    "Citizen",
    "Contact",
    "Location",
    "Geotagged Location",
    "Latitude",
    "Longitude",
    "Date",
    "Time",
    "Description",
  ];

  const lines = [headers.map(escapeCsvCell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.title,
        row.category,
        row.department,
        row.status,
        row.priority,
        row.citizen,
        row.contact,
        row.location,
        row.geotaggedLocation,
        row.latitude,
        row.longitude,
        row.date,
        row.time,
        row.description,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}

function isCenroDepartment(department = "") {
  return String(department || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .includes("cenro");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsString(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function createMapHtml({
  latitude,
  longitude,
  address = "",
  title = "",
}) {
  const complaintLat = Number(String(latitude ?? "").trim());
  const complaintLng = Number(String(longitude ?? "").trim());

  if (!Number.isFinite(complaintLat) || !Number.isFinite(complaintLng)) {
    return `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#f7faf6;color:#6f776f;font-family:Arial;">
          No valid pinned location.
        </body>
      </html>
    `;
  }

  const safeAddress =
    String(address || "").trim() || "Exact address unavailable";
  const safeTitle = String(title || "").trim() || "Complaint Location";
  const popupHtml = `
    <div class="popup-card">
      <div class="popup-title">${escapeHtml(safeTitle)}</div>
      <div class="popup-label">Exact Address</div>
      <div class="popup-address">${escapeHtml(safeAddress)}</div>
      <div class="popup-coords">${complaintLat.toFixed(6)}, ${complaintLng.toFixed(6)}</div>
      <div class="popup-hint">Double tap pin for Street View</div>
    </div>
  `.replace(/\n/g, "");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
        <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
        <style>
          html, body, #map {
            margin: 0; padding: 0; width: 100%; height: 100%;
            background: #f7faf6; overflow: hidden; font-family: Arial, sans-serif;
          }
          .complaint-marker {
            width: 28px; height: 40px; display: block; background: transparent;
          }
          .complaint-marker svg {
            display: block; width: 28px; height: 40px; overflow: visible;
          }
          .moderator-marker-wrap {
            width: 22px; height: 22px; position: relative;
          }
          .moderator-pulse {
            position: absolute; width: 36px; height: 36px; left: -7px; top: -7px;
            border-radius: 50%; background: rgba(49, 90, 154, 0.22);
            animation: pulse 1.5s ease-out infinite;
            pointer-events: none;
          }
          .moderator-dot {
            position: absolute; width: 22px; height: 22px; left: 0; top: 0;
            border-radius: 50%; background: #315a9a; border: 3px solid #ffffff;
            box-shadow: 0 2px 8px rgba(0,0,0,0.28);
          }
          .moderator-arrow {
            position: absolute; left: 5px; top: -16px; width: 0; height: 0;
            border-left: 6px solid transparent; border-right: 6px solid transparent;
            border-bottom: 14px solid #315a9a; transform-origin: 6px 27px;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.25));
            pointer-events: none;
          }
          @keyframes pulse {
            0% { transform: scale(0.65); opacity: 0.8; }
            100% { transform: scale(1.35); opacity: 0; }
          }
          .map-controls {
            position: absolute; right: 10px; top: 10px; z-index: 999;
            display: flex; flex-direction: column; gap: 7px;
          }
          .control-btn {
            width: 42px; min-height: 39px; border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.12); background: white; color: #171717;
            font-size: 20px; font-weight: 800; box-shadow: 0 2px 7px rgba(0,0,0,0.18); padding: 4px;
          }
          .maplibregl-popup-content {
            border-radius: 12px; padding: 10px 12px; max-width: 240px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          }
          .popup-card .popup-title { font-size: 12px; font-weight: 800; color: #171717; margin-bottom: 6px; }
          .popup-card .popup-label { font-size: 10px; font-weight: 700; color: #087A0D; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
          .popup-card .popup-address { font-size: 12px; color: #333; line-height: 1.35; margin-bottom: 6px; }
          .popup-card .popup-coords { font-size: 10px; color: #6f776f; margin-bottom: 4px; }
          .popup-card .popup-hint { font-size: 10px; color: #087A0D; font-weight: 700; }
          #streetPanel {
            position: absolute; left: 0; right: 0; bottom: 0; height: 48%; z-index: 1100;
            display: none; background: #000; border-top-left-radius: 16px; border-top-right-radius: 16px;
            overflow: hidden; box-shadow: 0 -6px 18px rgba(0,0,0,0.25);
          }
          #streetPanel.visible { display: block; }
          #streetPanel iframe { width: 100%; height: 100%; border: 0; }
          .street-header {
            position: absolute; top: 8px; left: 10px; right: 10px; z-index: 2;
            display: flex; justify-content: space-between; align-items: center; gap: 8px;
          }
          .street-chip {
            background: rgba(255,255,255,0.92); color: #171717; font-size: 11px; font-weight: 700;
            padding: 6px 10px; border-radius: 999px;
          }
          .street-close {
            background: #d71920; color: white; border: 0; border-radius: 999px;
            padding: 6px 12px; font-size: 11px; font-weight: 800;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <div class="map-controls">
          <button class="control-btn" onclick="window.zoomIn()">+</button>
          <button class="control-btn" onclick="window.zoomOut()">−</button>
          <button class="control-btn" onclick="window.tiltUp()">↑</button>
          <button class="control-btn" onclick="window.tiltDown()">↓</button>
        </div>
        <div id="streetPanel">
          <div class="street-header">
            <div class="street-chip">Street-level view</div>
            <button class="street-close" onclick="window.closeStreetView()">Close</button>
          </div>
          <iframe id="streetFrame" allowfullscreen allow="accelerometer; gyroscope; fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
        <script>
          const complaintLng = ${complaintLng};
          const complaintLat = ${complaintLat};
          const popupHtml = ${JSON.stringify(popupHtml)};
          const hybridStyle = "https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_API_KEY}";

          let mapLoaded = false;
          let moderatorMarker = null;
          let moderatorArrowElement = null;
          let latestModeratorLng = null;
          let latestModeratorLat = null;
          let latestHeading = 0;
          let pendingModeratorPosition = null;
          let complaintPopup = null;
          let complaintMarker = null;
          let lastMarkerTapAt = 0;

          const map = new maplibregl.Map({
            container: "map",
            style: hybridStyle,
            center: [complaintLng, complaintLat],
            zoom: 16,
            pitch: 0,
            bearing: 0,
            maxPitch: 85,
            attributionControl: true,
          });

          function openStreetView() {
            const panel = document.getElementById("streetPanel");
            const frame = document.getElementById("streetFrame");
            if (!panel || !frame) return;
            frame.src =
              "https://maps.google.com/maps?q=&layer=c&cbll=" +
              complaintLat + "," + complaintLng +
              "&cbp=12,0,0,0,0&hl=en&output=svembed";
            panel.classList.add("visible");
            setTimeout(function() { map.resize(); }, 220);
          }

          window.closeStreetView = function() {
            const panel = document.getElementById("streetPanel");
            const frame = document.getElementById("streetFrame");
            if (panel) panel.classList.remove("visible");
            if (frame) frame.src = "";
            setTimeout(function() { map.resize(); }, 220);
          };

          function bindComplaintMarkerDoubleTap(markerElement) {
            if (!markerElement) return;
            markerElement.style.cursor = "pointer";
            markerElement.title = "Double tap for Street View";

            function handleDoubleTap(event) {
              if (event) {
                event.preventDefault();
                event.stopPropagation();
              }
              openStreetView();
            }

            markerElement.addEventListener("dblclick", handleDoubleTap);
            markerElement.addEventListener("touchend", function(event) {
              const now = Date.now();
              if (now - lastMarkerTapAt < 320) {
                lastMarkerTapAt = 0;
                handleDoubleTap(event);
                return;
              }
              lastMarkerTapAt = now;
            }, { passive: false });
          }

          function createComplaintMarkerElement() {
            const element = document.createElement("div");
            element.className = "complaint-marker";
            element.innerHTML =
              '<svg viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
              '<path d="M14 1.5C7.65 1.5 2.5 6.65 2.5 13c0 8.75 11.5 25.5 11.5 25.5S25.5 21.75 25.5 13C25.5 6.65 20.35 1.5 14 1.5z" fill="#d71920" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>' +
              '<circle cx="14" cy="13" r="4.2" fill="#ffffff"/>' +
              "</svg>";
            return element;
          }

          function placeComplaintMarker() {
            if (complaintMarker) {
              try { complaintMarker.remove(); } catch (e) {}
              complaintMarker = null;
            }

            const complaintMarkerElement = createComplaintMarkerElement();
            bindComplaintMarkerDoubleTap(complaintMarkerElement);

            complaintPopup = new maplibregl.Popup({
              offset: 24,
              maxWidth: "260px",
              closeButton: true,
              closeOnClick: false,
            }).setHTML(popupHtml);

            complaintMarker = new maplibregl.Marker({
              element: complaintMarkerElement,
              anchor: "bottom",
              pitchAlignment: "map",
              rotationAlignment: "map",
            })
              .setLngLat([complaintLng, complaintLat])
              .setPopup(complaintPopup)
              .addTo(map);

            complaintMarker.togglePopup();
          }

          function createModeratorMarkerElement() {
            const wrapper = document.createElement("div");
            wrapper.className = "moderator-marker-wrap";
            const pulse = document.createElement("div");
            pulse.className = "moderator-pulse";
            const arrow = document.createElement("div");
            arrow.className = "moderator-arrow";
            const dot = document.createElement("div");
            dot.className = "moderator-dot";
            wrapper.appendChild(pulse);
            wrapper.appendChild(arrow);
            wrapper.appendChild(dot);
            moderatorArrowElement = arrow;
            return wrapper;
          }

          map.on("load", function() {
            mapLoaded = true;
            placeComplaintMarker();
            if (pendingModeratorPosition) {
              window.updateModeratorPosition(
                pendingModeratorPosition.lat,
                pendingModeratorPosition.lng,
                pendingModeratorPosition.heading
              );
            }
            setTimeout(function() { map.resize(); }, 300);
          });

          window.updateModeratorPosition = function(lat, lng, heading) {
            const parsedLat = Number(lat);
            const parsedLng = Number(lng);
            const parsedHeading = Number(heading);
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return;

            latestModeratorLat = parsedLat;
            latestModeratorLng = parsedLng;
            if (Number.isFinite(parsedHeading) && parsedHeading >= 0) {
              latestHeading = parsedHeading;
            }

            if (!mapLoaded) {
              pendingModeratorPosition = { lat: parsedLat, lng: parsedLng, heading: latestHeading };
              return;
            }

            if (!moderatorMarker) {
              moderatorMarker = new maplibregl.Marker({
                element: createModeratorMarkerElement(),
                anchor: "center",
                pitchAlignment: "map",
                rotationAlignment: "map",
              })
                .setLngLat([parsedLng, parsedLat])
                .setPopup(new maplibregl.Popup().setText("Department Head Location"))
                .addTo(map);

              // On first placement, frame both pins so a wrong city-center
              // complaint pin vs live GPS is obvious, and nearby pins stay close.
              try {
                const bounds = new maplibregl.LngLatBounds(
                  [complaintLng, complaintLat],
                  [parsedLng, parsedLat]
                );
                const toRad = Math.PI / 180;
                const dLat = (parsedLat - complaintLat) * toRad;
                const dLng = (parsedLng - complaintLng) * toRad;
                const a =
                  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(complaintLat * toRad) *
                    Math.cos(parsedLat * toRad) *
                    Math.sin(dLng / 2) *
                    Math.sin(dLng / 2);
                const distanceMeters =
                  2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                if (distanceMeters < 25) {
                  map.easeTo({
                    center: [
                      (complaintLng + parsedLng) / 2,
                      (complaintLat + parsedLat) / 2,
                    ],
                    zoom: Math.max(map.getZoom(), 18),
                    duration: 450,
                  });
                } else if (distanceMeters < 8000) {
                  map.fitBounds(bounds, {
                    padding: 70,
                    maxZoom: 19,
                    duration: 550,
                  });
                }
              } catch (fitError) {
                console.log("Fit both markers error", fitError);
              }
            } else {
              moderatorMarker.setLngLat([parsedLng, parsedLat]);
            }

            if (moderatorArrowElement) {
              moderatorArrowElement.style.transform = "rotate(" + latestHeading + "deg)";
            }
          };

          window.zoomIn = function() {
            if (!mapLoaded) return;
            map.easeTo({ zoom: map.getZoom() + 1, duration: 280 });
          };
          window.zoomOut = function() {
            if (!mapLoaded) return;
            map.easeTo({ zoom: map.getZoom() - 1, duration: 280 });
          };
          window.tiltUp = function() {
            if (!mapLoaded) return;
            map.easeTo({ pitch: Math.min(85, map.getPitch() + 12), duration: 280 });
          };
          window.tiltDown = function() {
            if (!mapLoaded) return;
            map.easeTo({ pitch: Math.max(0, map.getPitch() - 12), duration: 280 });
          };

          window.drawRouteToComplaint = async function(lat, lng) {
            const parsedLat = Number(lat);
            const parsedLng = Number(lng);
            if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || !mapLoaded) return;
            try {
              const url =
                "https://router.project-osrm.org/route/v1/driving/" +
                parsedLng + "," + parsedLat + ";" +
                complaintLng + "," + complaintLat +
                "?overview=full&geometries=geojson";
              const response = await fetch(url);
              const data = await response.json();
              const route = data && data.routes && data.routes[0] && data.routes[0].geometry;
              if (!route) return;

              if (map.getSource("route-to-complaint")) {
                map.getSource("route-to-complaint").setData({ type: "Feature", geometry: route });
              } else {
                map.addSource("route-to-complaint", {
                  type: "geojson",
                  data: { type: "Feature", geometry: route },
                });
                map.addLayer({
                  id: "route-to-complaint-line",
                  type: "line",
                  source: "route-to-complaint",
                  layout: { "line-join": "round", "line-cap": "round" },
                  paint: { "line-color": "#087A0D", "line-width": 5, "line-opacity": 0.88 },
                });
              }

              const coordinates = route.coordinates;
              const bounds = coordinates.reduce(function(b, coord) {
                return b.extend(coord);
              }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
              map.fitBounds(bounds, { padding: 60, duration: 900 });
            } catch (error) {
              console.log("Route error", error);
            }
          };
        </script>
      </body>
    </html>
  `;
}

export default function DepartmentHeadAssignedComplaints() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();

  const lastAssignedFilter = getPageCache(DEPT_ASSIGNED_LAST_FILTER_KEY) || {};
  const selectedCategoryInit = lastAssignedFilter.category || "All Category";
  const selectedStatusInit = lastAssignedFilter.status || "All Status";
  const selectedPriorityInit = lastAssignedFilter.priority || "All Priority";
  const cachedAssigned = getPageCache(
    assignedComplaintsCacheKey({
      category: selectedCategoryInit,
      status: selectedStatusInit,
      priority: selectedPriorityInit,
    })
  );

  const [complaints, setComplaints] = useState(cachedAssigned?.complaints ?? []);
  const [complaintsTotal, setComplaintsTotal] = useState(cachedAssigned?.total ?? 0);
  const [loadingComplaints, setLoadingComplaints] = useState(!cachedAssigned);
  const [loadingMoreComplaints, setLoadingMoreComplaints] = useState(false);
  const [hasMoreComplaints, setHasMoreComplaints] = useState(
    cachedAssigned?.hasMore !== false
  );
  const [departmentHeadDepartment, setDepartmentHeadDepartment] = useState(
    cachedAssigned?.department ?? DEFAULT_DEPARTMENT_HEAD_DEPARTMENT
  );
  const [currentUserId, setCurrentUserId] = useState(
    cachedAssigned?.currentUserId ?? null
  );
  const [currentUserEmail, setCurrentUserEmail] = useState(null);

  const [selectedCategory, setSelectedCategory] = useState(selectedCategoryInit);
  const [selectedStatus, setSelectedStatus] = useState(selectedStatusInit);
  const [selectedPriority, setSelectedPriority] = useState(selectedPriorityInit);

  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);
  const [priorityDropdownVisible, setPriorityDropdownVisible] = useState(false);

  const [detailsVisible, setDetailsVisible] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);

  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [reassignModalVisible, setReassignModalVisible] = useState(false);
  const [actionComplaint, setActionComplaint] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [selectedReassignTarget, setSelectedReassignTarget] = useState(null);
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [submittingReassignment, setSubmittingReassignment] = useState(false);

  const [fullMapVisible, setFullMapVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useHideBottomNav(
    detailsVisible ||
      statusModalVisible ||
      reassignModalVisible ||
      fullMapVisible
  );

  const [departmentHeadLocation, setDepartmentHeadLocation] = useState(null);
  const [departmentHeadHeading, setDepartmentHeadHeading] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);

  const inlineMapRef = useRef(null);
  const fullMapRef = useRef(null);
  const locationWatcherRef = useRef(null);
  const headingWatcherRef = useRef(null);
  const complaintsRef = useRef(cachedAssigned?.complaints ?? []);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(cachedAssigned?.hasMore !== false);
  const listViewportHeightRef = useRef(0);
  const assignedMatchModeRef = useRef("exact");

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const categoryFilters = useMemo(() => {
    const departmentCategories = getCategoriesForDepartment(departmentHeadDepartment);
    const complaintCategories = complaints.map((item) => item.category).filter(Boolean);
    const uniqueCategories = Array.from(new Set([...departmentCategories, ...complaintCategories]));

    return ["All Category", ...uniqueCategories];
  }, [complaints, departmentHeadDepartment]);

  useEffect(() => {
    if (!categoryFilters.includes(selectedCategory)) {
      setSelectedCategory("All Category");
    }
  }, [categoryFilters, selectedCategory]);

  const smoothNavigate = useCallback(
    (route, isActive = false) => {
      if (isActive) return;
      router.replace(route);
    },
    [router]
  );

  const loadDepartmentHeadDepartment = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        console.log("Assigned complaints auth user missing:", userError);
        setCurrentUserId(null);
        setCurrentUserEmail(null);
        setDepartmentHeadDepartment("");
        return "";
      }

      const userEmail = String(user.email || "").replace(/\s+/g, " ").trim();

      setCurrentUserId(user.id);
      setCurrentUserEmail(userEmail || null);

      if (!userEmail) {
        setDepartmentHeadDepartment("");
        return "";
      }

      let profileData = null;

      const { data: profileByEmail, error: profileByEmailError } =
        await supabase
          .from("profiles")
          .select("id,email,role,department")
          .ilike("email", userEmail)
          .maybeSingle();

      if (profileByEmailError) {
        console.log(
          "Load department head profile by email error:",
          profileByEmailError
        );
      } else {
        profileData = profileByEmail;
      }

      if (!profileData && user.id) {
        const { data: profileById, error: profileByIdError } = await supabase
          .from("profiles")
          .select("id,email,role,department")
          .eq("id", user.id)
          .maybeSingle();

        if (profileByIdError) {
          console.log("Load moderator profile by id error:", profileByIdError);
        } else {
          profileData = profileById;
        }
      }

      const databaseDepartment = String(profileData?.department || "")
        .replace(/\s+/g, " ")
        .trim();

      const metadataDepartment = String(
        user.user_metadata?.department ||
          user.user_metadata?.assigned_office ||
          user.user_metadata?.office ||
          user.user_metadata?.department_name ||
          ""
      )
        .replace(/\s+/g, " ")
        .trim();

      const nextDepartment = databaseDepartment || metadataDepartment || "";

      setDepartmentHeadDepartment(nextDepartment);

      console.log("Department head assigned complaints department resolved:", {
        email: userEmail,
        authUserId: user.id,
        profileEmail: profileData?.email || "",
        role: profileData?.role || "",
        databaseDepartment,
        metadataDepartment,
        finalDepartment: nextDepartment,
      });

      return nextDepartment;
    } catch (error) {
      console.log("Load moderator department error:", error);
      setDepartmentHeadDepartment("");
      return "";
    }
  }, []);

  const loadCitizenProfiles = useCallback(async (citizenIds = []) => {
    const uniqueIds = Array.from(new Set((citizenIds || []).filter(Boolean)));

    if (uniqueIds.length === 0) return {};

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,contact_number,avatar_url")
        .in("id", uniqueIds);

      if (error) {
        console.log("Load citizen profiles error:", error);
        return {};
      }

      const profileEntries = await Promise.all(
        (data || []).map(async (profile) => {
          const readableAvatarUrl = await createReadableAvatarUrl(
            profile.avatar_url
          );

          return [
            profile.id,
            {
              id: profile.id,
              email: profile.email || "",
              full_name: profile.full_name || "Citizen",
              contact_number: profile.contact_number || "No contact number",
              avatar_url: readableAvatarUrl,
            },
          ];
        })
      );

      return Object.fromEntries(profileEntries);
    } catch (error) {
      console.log("Load citizen profiles catch error:", error);
      return {};
    }
  }, []);

  const loadAssignedComplaints = useCallback(
    async (showLoader = true, append = false) => {
      const cacheKey = assignedComplaintsCacheKey({
        category: selectedCategory,
        status: selectedStatus,
        priority: selectedPriority,
      });
      const cached = !append ? getPageCache(cacheKey) : null;

      if (!append && cached?.complaints) {
        complaintsRef.current = cached.complaints;
        setComplaints(cached.complaints);
        setComplaintsTotal(cached.total ?? cached.complaints.length);
        hasMoreRef.current = cached.hasMore !== false;
        setHasMoreComplaints(cached.hasMore !== false);
        if (cached.department) setDepartmentHeadDepartment(cached.department);
        if (cached.currentUserId) setCurrentUserId(cached.currentUserId);
      }

      if (append) {
        if (loadingMoreRef.current || !hasMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMoreComplaints(true);
      } else {
        hasMoreRef.current = cached?.hasMore !== false;
        assignedMatchModeRef.current = "exact";
      }

      try {
        if (showLoader && !append && shouldShowPageLoader(cacheKey)) {
          setLoadingComplaints(true);
        }

        const department = await loadDepartmentHeadDepartment();
        const cleanDepartment = String(department || "")
          .replace(/\s+/g, " ")
          .trim();

        if (!cleanDepartment) {
          console.log("No moderator department found. Check profiles.department.");
          if (!cached) {
            setComplaints([]);
            setComplaintsTotal(0);
            hasMoreRef.current = false;
            setHasMoreComplaints(false);
          }
          return;
        }

        const offset = append ? complaintsRef.current.length : 0;
        const pageSize = append
          ? COMPLAINTS_PAGE_SIZE
          : Math.max(COMPLAINTS_PAGE_SIZE, cached?.complaints?.length || 0);

        const listFilters = {
          ...(selectedStatus === "In Progress"
            ? { statusIn: ["In Progress", "Returned"] }
            : {
                status:
                  selectedStatus === "All Status" ? undefined : selectedStatus,
              }),
          category:
            selectedCategory === "All Category" ? undefined : selectedCategory,
          priority:
            selectedPriority === "All Priority" ? undefined : selectedPriority,
        };

        const runPagedQuery = (officeClause) => {
          let query = supabase
            .from("complaints")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false });

          if (officeClause === "exact") {
            query = query.ilike("assigned_office", cleanDepartment);
          } else if (officeClause === "loose") {
            query = query.ilike("assigned_office", `%${cleanDepartment}%`);
          }

          query = applyComplaintOffsetFilters(query, listFilters);
          return applyOffsetPagination(query, offset, pageSize);
        };

        let complaintsRows = [];
        let queryError = null;
        let total = 0;
        const matchMode = append ? assignedMatchModeRef.current : "exact";

        if (matchMode === "visible") {
          const { data: visibleData, error: visibleError } = await supabase
            .from("complaints")
            .select("*")
            .order("created_at", { ascending: false });

          if (visibleError) {
            queryError = visibleError;
          } else {
            const matchedRows = (visibleData || []).filter((row) =>
              complaintAppliesToDepartment(
                row.assigned_office,
                row.category || row.concern_category,
                cleanDepartment
              )
            );

            const { from, to } = getOffsetPageRange(offset, pageSize);
            complaintsRows = matchedRows.slice(from, to + 1);
            total = matchedRows.length;
          }
        } else {
          const {
            data: pagedData,
            error: pagedError,
            count: pagedCount,
          } = await runPagedQuery(matchMode);

          if (pagedError) {
            queryError = pagedError;
            console.log("Assigned complaints load error:", pagedError);
          } else {
            complaintsRows = pagedData || [];
            total = pagedCount ?? 0;
          }
        }

        if (!append && !queryError && complaintsRows.length === 0) {
          const { data: looseData, error: looseError, count: looseCount } =
            await runPagedQuery("loose");

          if (looseError) {
            queryError = looseError;
          } else if ((looseData || []).length > 0) {
            complaintsRows = looseData || [];
            total = looseCount ?? 0;
            assignedMatchModeRef.current = "loose";
          }
        }

        if (!append && !queryError && complaintsRows.length === 0) {
          const { data: visibleData, error: visibleError } = await supabase
            .from("complaints")
            .select("*")
            .order("created_at", { ascending: false });

          if (visibleError) {
            queryError = visibleError;
          } else {
            const matchedRows = (visibleData || []).filter((row) =>
              complaintAppliesToDepartment(
                row.assigned_office,
                row.category || row.concern_category,
                cleanDepartment
              )
            );

            const { from, to } = getOffsetPageRange(offset, pageSize);
            complaintsRows = matchedRows.slice(from, to + 1);
            total = matchedRows.length;
            assignedMatchModeRef.current = "visible";
          }
        }

        if (queryError) {
          console.log("Assigned complaints final load error:", queryError);
          if (!append && !cached) {
            setComplaints([]);
            setComplaintsTotal(0);
          }
          return;
        }

        setComplaintsTotal(total);

        const citizenIds = Array.from(
          new Set((complaintsRows || []).map((row) => row.citizen_id).filter(Boolean))
        );

        const profileMap = await loadCitizenProfiles(citizenIds);

        const mappedComplaints = await Promise.all(
          (complaintsRows || []).map((row) => mapComplaintRow(row, profileMap))
        );

        const nextComplaints = append
          ? mergeComplaintPages(complaintsRef.current, mappedComplaints)
          : mappedComplaints;

        complaintsRef.current = nextComplaints;
        setComplaints(nextComplaints);

        if (mappedComplaints.length === 0) {
          hasMoreRef.current = false;
          setHasMoreComplaints(false);
        } else {
          const more = nextComplaints.length < total;
          hasMoreRef.current = more;
          setHasMoreComplaints(more);
        }

        setPageCache(cacheKey, {
          complaints: nextComplaints,
          total,
          hasMore:
            mappedComplaints.length === 0 ? false : nextComplaints.length < total,
          department: cleanDepartment,
          currentUserId,
        });
        setPageCache(DEPT_ASSIGNED_LAST_FILTER_KEY, {
          category: selectedCategory,
          status: selectedStatus,
          priority: selectedPriority,
        });
      } catch (error) {
        console.log("Load assigned complaints error:", error);
        if (!append && !cached) {
          setComplaints([]);
          setComplaintsTotal(0);
        }
      } finally {
        setLoadingComplaints(false);

        if (append) {
          loadingMoreRef.current = false;
          setLoadingMoreComplaints(false);
        }
      }
    },
    [
      loadCitizenProfiles,
      loadDepartmentHeadDepartment,
      selectedCategory,
      selectedPriority,
      selectedStatus,
    ]
  );

  const loadAssignedComplaintsRef = useRef(loadAssignedComplaints);
  loadAssignedComplaintsRef.current = loadAssignedComplaints;

  const loadMoreComplaints = useCallback(() => {
    loadAssignedComplaints(false, true);
  }, [loadAssignedComplaints]);

  const handleComplaintsScroll = ({ nativeEvent }) => {
    if (isNearContentBottom(nativeEvent)) {
      loadMoreComplaints();
    }
  };

  const maybeFillViewport = (contentHeight) => {
    if (
      hasMoreRef.current &&
      !loadingMoreRef.current &&
      listViewportHeightRef.current > 0 &&
      contentHeight < listViewportHeightRef.current + 80
    ) {
      loadMoreComplaints();
    }
  };

  useEffect(() => {
    complaintsRef.current = complaints;
  }, [complaints]);

  useFocusEffect(
    useCallback(() => {
      loadAssignedComplaints(true);
    }, [loadAssignedComplaints])
  );

  useEffect(() => {
    if (!currentUserId) return;

    const complaintsChannel = supabase
      .channel(`moderator-assigned-complaints-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
        },
        () => {
          loadAssignedComplaintsRef.current?.(false);
        }
      )
      .subscribe((status) => {
        console.log("Moderator assigned complaints realtime status:", status);
      });

    const profileChannel = supabase
      .channel(`moderator-profile-department-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          const newProfile = payload.new || {};
          const oldProfile = payload.old || {};
          const changedProfileEmail = newProfile.email || oldProfile.email;
          const changedProfileId = newProfile.id || oldProfile.id;

          const emailMatches =
            currentUserEmail &&
            changedProfileEmail &&
            normalizeText(changedProfileEmail) === normalizeText(currentUserEmail);

          const idMatches = changedProfileId && changedProfileId === currentUserId;

          if (emailMatches || idMatches) {
            loadAssignedComplaintsRef.current?.(false);
          }
        }
      )
      .subscribe((status) => {
        console.log("Department head profile realtime status:", status);
      });

    return () => {
      supabase.removeChannel(complaintsChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [currentUserId, currentUserEmail]);

  const startDepartmentHeadTracking = useCallback(async () => {
    try {
      setLocationLoading(true);

      if (
        !currentUserId ||
        !(await isLocationUsageAllowed(currentUserId))
      ) {
        setDepartmentHeadLocation(null);

        if (locationWatcherRef.current) {
          locationWatcherRef.current.remove();
          locationWatcherRef.current = null;
        }

        if (headingWatcherRef.current) {
          headingWatcherRef.current.remove();
          headingWatcherRef.current = null;
        }

        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setDepartmentHeadLocation(null);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      setDepartmentHeadLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      if (
        typeof currentLocation.coords.heading === "number" &&
        currentLocation.coords.heading >= 0
      ) {
        setDepartmentHeadHeading(currentLocation.coords.heading);
      }

      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }

      if (headingWatcherRef.current) {
        headingWatcherRef.current.remove();
        headingWatcherRef.current = null;
      }

      locationWatcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (updatedLocation) => {
          setDepartmentHeadLocation({
            latitude: updatedLocation.coords.latitude,
            longitude: updatedLocation.coords.longitude,
          });

          if (
            typeof updatedLocation.coords.heading === "number" &&
            updatedLocation.coords.heading >= 0
          ) {
            setDepartmentHeadHeading(updatedLocation.coords.heading);
          }
        }
      );

      headingWatcherRef.current = await Location.watchHeadingAsync(
        (headingData) => {
          const nextHeading =
            typeof headingData.trueHeading === "number" &&
            headingData.trueHeading >= 0
              ? headingData.trueHeading
              : headingData.magHeading;

          if (typeof nextHeading === "number" && nextHeading >= 0) {
            setDepartmentHeadHeading(nextHeading);
          }
        }
      );
    } catch {
      notify(
        "Location Error",
        "Unable to get your location. Please try again."
      );
    } finally {
      setLocationLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    startDepartmentHeadTracking();

    return () => {
      if (locationWatcherRef.current) {
        locationWatcherRef.current.remove();
        locationWatcherRef.current = null;
      }

      if (headingWatcherRef.current) {
        headingWatcherRef.current.remove();
        headingWatcherRef.current = null;
      }
    };
  }, [startDepartmentHeadTracking]);

  useFocusEffect(
    useCallback(() => {
      startDepartmentHeadTracking();
    }, [startDepartmentHeadTracking])
  );

  const filteredComplaints = useMemo(() => {
    const filtered = complaints.filter((item) => {
      const departmentMatch =
        normalizeText(item.department) ===
        normalizeText(departmentHeadDepartment);

      const categoryMatch =
        selectedCategory === "All Category" || item.category === selectedCategory;

      const statusMatch =
        selectedStatus === "All Status" ||
        item.status === selectedStatus ||
        (selectedStatus === "In Progress" && item.status === "Returned");

      const priorityMatch =
        selectedPriority === "All Priority" || item.priority === selectedPriority;

      return departmentMatch && categoryMatch && statusMatch && priorityMatch;
    });

    return [...filtered].sort(
      (a, b) =>
        parseComplaintDateTime(b.date, b.time) -
        parseComplaintDateTime(a.date, a.time)
    );
  }, [complaints, departmentHeadDepartment, selectedCategory, selectedStatus, selectedPriority]);

  const canExportCsv = isCenroDepartment(departmentHeadDepartment);

  const exportComplaintsToCsv = async () => {
    if (!canExportCsv) {
      return;
    }

    try {
      const department = String(departmentHeadDepartment || "")
        .replace(/\s+/g, " ")
        .trim();

      let exportQuery = supabase
        .from("complaints")
        .select("*")
        .ilike("assigned_office", `%${department}%`)
        .order("created_at", { ascending: false });

      exportQuery = applyComplaintOffsetFilters(exportQuery, {
        ...(selectedStatus === "In Progress"
          ? { statusIn: ["In Progress", "Returned"] }
          : {
              status:
                selectedStatus === "All Status" ? undefined : selectedStatus,
            }),
        category:
          selectedCategory === "All Category" ? undefined : selectedCategory,
        priority:
          selectedPriority === "All Priority" ? undefined : selectedPriority,
      });

      const { data: exportRows, error: exportError } = await exportQuery;

      if (exportError) {
        notify("Export Failed", exportError.message);
        return;
      }

      const citizenIds = Array.from(
        new Set((exportRows || []).map((row) => row.citizen_id).filter(Boolean))
      );
      const profileMap = await loadCitizenProfiles(citizenIds);
      const mappedComplaints = await Promise.all(
        (exportRows || []).map((row) => mapComplaintRow(row, profileMap))
      );

      if (mappedComplaints.length === 0) {
        notify(
          "Nothing to Export",
          "There are no complaints matching the current filters."
        );
        return;
      }

      const csv = buildComplaintsCsv(mappedComplaints);
      const dateStamp = new Date().toISOString().slice(0, 10);
      const fileUri = `${FileSystem.cacheDirectory}cenro-complaints-${dateStamp}.csv`;

      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const shareResult = await Share.share(
        Platform.OS === "ios"
          ? {
              url: fileUri,
              title: "Export CENRO Complaints CSV",
            }
          : {
              message: csv,
              title: "Export CENRO Complaints CSV",
              url: fileUri,
            }
      );

      if (shareResult.action === Share.dismissedAction) {
        return;
      }

      writeAuditLog({
        action: "csv_export",
        title: "Complaints Exported",
        description: `${mappedComplaints.length} CENRO complaint records were exported to CSV.`,
        actorRole: "moderator",
        metadata: { count: mappedComplaints.length },
      });
    } catch (error) {
      console.log("CSV export error:", error);
      notify("Export Failed", "Unable to export complaints to CSV.");
    }
  };

  const selectedMapHtml = useMemo(() => {
    if (!selectedComplaint) return "";

    return createMapHtml({
      latitude: selectedComplaint.latitude,
      longitude: selectedComplaint.longitude,
      address:
        selectedComplaint.geotaggedLocation ||
        selectedComplaint.location ||
        "",
      title: selectedComplaint.title || "Complaint Location",
    });
  }, [selectedComplaint]);

  const injectDepartmentHeadMapUpdate = useCallback(
    (delay = 0) => {
      if (!departmentHeadLocation) return;

      const jsCode = `
        if (window.updateModeratorPosition) {
          window.updateModeratorPosition(
            ${departmentHeadLocation.latitude},
            ${departmentHeadLocation.longitude},
            ${departmentHeadHeading}
          );
        }
        true;
      `;

      const runInjection = () => {
        inlineMapRef.current?.injectJavaScript(jsCode);
        fullMapRef.current?.injectJavaScript(jsCode);
      };

      if (delay > 0) setTimeout(runInjection, delay);
      else runInjection();
    },
    [departmentHeadLocation, departmentHeadHeading]
  );

  useEffect(() => {
    injectDepartmentHeadMapUpdate(0);
  }, [injectDepartmentHeadMapUpdate, selectedComplaint, fullMapVisible]);

  useEffect(() => {
    if (!selectedComplaint) return;

    const refreshedSelectedComplaint = complaints.find(
      (item) => item.rawId === selectedComplaint.rawId
    );

    if (refreshedSelectedComplaint) {
      setSelectedComplaint(refreshedSelectedComplaint);
    }
  }, [complaints]);

  const openDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setDetailsVisible(true);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  const closeDetails = () => {
    setDetailsVisible(false);
    setSelectedComplaint(null);
    setFullMapVisible(false);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
    setStatusModalVisible(false);
    setReassignModalVisible(false);
    setActionComplaint(null);
    setUpdatingStatusId(null);
    setSelectedReassignTarget(null);
    setReassignmentReason("");
    setSubmittingReassignment(false);
  };

  const openFullMap = () => {
    if (!selectedComplaint?.latitude || !selectedComplaint?.longitude) {
      notify(
        "Map Unavailable",
        "This complaint has no valid pinned location coordinates."
      );
      return;
    }

    setFullMapVisible(true);
  };

  const closeFullMap = () => {
    setFullMapVisible(false);
  };

  const routeToPinnedLocation = () => {
    if (!selectedComplaint?.latitude || !selectedComplaint?.longitude) {
      notify(
        "Route Unavailable",
        "This complaint has no valid pinned location."
      );
      return;
    }

    if (!departmentHeadLocation) {
      notify(
        "Department Head Location Needed",
        "Please update your location first before routing."
      );
      return;
    }

    const jsCode = `
      if (window.drawRouteToComplaint) {
        window.drawRouteToComplaint(
          ${departmentHeadLocation.latitude},
          ${departmentHeadLocation.longitude}
        );
      }
      true;
    `;

    inlineMapRef.current?.injectJavaScript(jsCode);
    fullMapRef.current?.injectJavaScript(jsCode);
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

  const openUpdateStatusModal = (complaint) => {
    if (normalizeStatus(complaint.status) === "Completed") {
      notify(
        "Status Locked",
        "Completed complaints can no longer be updated by the department head. The admin is responsible for marking complaints as completed after reviewing citizen feedback."
      );
      return;
    }

    setActionComplaint(complaint);
    setStatusModalVisible(true);
  };

  const selectStatus = async (nextStatus) => {
    if (!actionComplaint || updatingStatusId) {
      return;
    }

    const complaint = actionComplaint;
    const oldStatus = normalizeStatus(complaint.status);

    if (nextStatus === "Completed") {
      notify(
        "Admin Action Required",
        "Only the admin can mark a complaint as completed after reviewing the citizen feedback."
      );
      return;
    }

    if (oldStatus === "Completed") {
      notify(
        "Status Locked",
        "Completed complaints can no longer be updated by the department head."
      );
      setStatusModalVisible(false);
      setActionComplaint(null);
      return;
    }

    // Close chooser immediately so the tap feels responsive.
    setStatusModalVisible(false);
    setActionComplaint(null);

    if (nextStatus === oldStatus) {
      return;
    }

    setUpdatingStatusId(complaint.rawId);

    // Optimistic UI — badge updates right away.
    setComplaints((prev) =>
      prev.map((item) =>
        item.rawId === complaint.rawId ? { ...item, status: nextStatus } : item
      )
    );

    if (selectedComplaint?.rawId === complaint.rawId) {
      setSelectedComplaint((prev) =>
        prev ? { ...prev, status: nextStatus } : prev
      );
    }

    try {
      const { data: updatedComplaint, error } = await supabase
        .from("complaints")
        .update({
          status: nextStatus,
        })
        .eq("id", complaint.rawId)
        .select("id, short_id, citizen_id, status")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!updatedComplaint) {
        throw new Error(
          "No complaint row was updated. Please check your department head update policy."
        );
      }

      setUpdatingStatusId(null);

      // Confirm right after the DB write — don't wait for push/notifications.
      notify(
        "Status Updated",
        `Complaint status changed to ${nextStatus}.`
      );

      writeAuditLog({
        action: "status_update",
        title: "Complaint Status Updated",
        description: `Complaint #${complaint.id} changed from ${oldStatus} to ${nextStatus}.`,
        entityType: "complaint",
        entityId: complaint.rawId,
        actorRole: "moderator",
        metadata: {
          old_status: oldStatus,
          new_status: nextStatus,
          assigned_office: complaint.department,
        },
      });

      // Notify citizen/admins in the background.
      const notificationType =
        (oldStatus === "In Progress" || oldStatus === "Returned") &&
        nextStatus === "For Validation"
          ? "validation"
          : "status";

      const notificationTitle =
        notificationType === "validation"
          ? "Complaint Needs Validation"
          : "Complaint Status Updated";

      const notificationMessage =
        notificationType === "validation"
          ? `Your complaint #${complaint.id} is now for validation. Please review it and provide feedback.`
          : `Your complaint #${complaint.id} status changed from ${oldStatus} to ${nextStatus}.`;

      Promise.resolve()
        .then(async () => {
          await createCitizenNotificationAndPush({
            citizenId: complaint.citizenId,
            complaintId: complaint.rawId,
            shortId: complaint.id,
            type: notificationType,
            title: notificationTitle,
            message: notificationMessage,
            status: nextStatus,
            metadata: {
              old_status: oldStatus,
              new_status: nextStatus,
              updated_by: currentUserId,
              assigned_office: complaint.department,
              title: complaint.title,
              category: complaint.category,
            },
          });

          if (nextStatus === "For Validation") {
            await notifyAdminsValidationRequired({
              complaint: {
                id: complaint.rawId,
                short_id: complaint.id,
                title: complaint.title,
                category: complaint.category,
                assigned_office: complaint.department,
                location_text:
                  complaint.geotaggedLocation || complaint.location,
                status: nextStatus,
              },
            });
          }

          loadAssignedComplaints(false);
        })
        .catch((notifyError) => {
          console.log("Status update notification error:", notifyError);
          loadAssignedComplaints(false);
        });
    } catch (error) {
      console.log("Update status error:", error);

      setComplaints((prev) =>
        prev.map((item) =>
          item.rawId === complaint.rawId
            ? { ...item, status: oldStatus }
            : item
        )
      );

      if (selectedComplaint?.rawId === complaint.rawId) {
        setSelectedComplaint((prev) =>
          prev ? { ...prev, status: oldStatus } : prev
        );
      }

      setUpdatingStatusId(null);
      notify(
        "Update Failed",
        error?.message || "Unable to update complaint status."
      );
    }
  };

  const openReassignModal = (complaint) => {
    if (complaint.status === "Completed") {
      notify(
        "Reassignment Locked",
        "Completed complaints can no longer be reassigned."
      );
      return;
    }

    setActionComplaint(complaint);
    setSelectedReassignTarget(null);
    setReassignmentReason("");
    setSubmittingReassignment(false);
    setReassignModalVisible(true);
  };

  const submitReassignment = async () => {
    if (!actionComplaint) return;

    const selectedItem = selectedReassignTarget;
    const reason = reassignmentReason.replace(/\s+/g, " ").trim();

    if (!selectedItem) {
      notify("Select Category", "Please choose the new category for this complaint.");
      return;
    }

    if (!reason) {
      notify(
        "Reason Required",
        "Please provide a reason for reassigning this complaint."
      );
      return;
    }

    const nextDepartment =
      selectedItem.department || getAssignedOffice(selectedItem.category);

    if (
      selectedItem.category === actionComplaint.category &&
      nextDepartment === actionComplaint.department
    ) {
      notify(
        "No Change Detected",
        "Please choose a different category or assigned office before submitting the reassignment."
      );
      return;
    }

    try {
      setSubmittingReassignment(true);

      const { data: reassignedComplaint, error } = await supabase.rpc(
        "reassign_complaint_by_moderator",
        {
          p_complaint_id: actionComplaint.rawId,
          p_new_category: selectedItem.category,
          p_new_assigned_office: nextDepartment,
          p_reason: reason,
        }
      );

      if (error) {
        notify("Reassign Failed", error.message);
        return;
      }

      if (!reassignedComplaint) {
        notify(
          "Reassign Failed",
          "No complaint row was updated. Please check if the reassignment RPC function exists in Supabase."
        );
        return;
      }

      const reassignedAt =
        reassignedComplaint.reassigned_at || new Date().toISOString();

      await notifyDepartmentHeadsReassigned({
        complaint: {
          id: actionComplaint.rawId,
          short_id: actionComplaint.id,
          title: actionComplaint.title,
          category: selectedItem.category,
          location_text:
            actionComplaint.geotaggedLocation || actionComplaint.location,
          status: actionComplaint.status,
        },
        newDepartment: nextDepartment,
        oldDepartment: actionComplaint.department,
        reason,
        excludeDepartmentHeadId: currentUserId,
      });

      await notifyAdminsReassignment({
        complaint: {
          id: actionComplaint.rawId,
          short_id: actionComplaint.id,
          title: actionComplaint.title,
          category: selectedItem.category,
          location_text:
            actionComplaint.geotaggedLocation || actionComplaint.location,
          status: actionComplaint.status,
        },
        oldDepartment: actionComplaint.department,
        newDepartment: nextDepartment,
        reason,
      });

      setComplaints((prev) =>
        prev
          .map((item) =>
            item.rawId === actionComplaint.rawId
              ? {
                  ...item,
                  category: selectedItem.category,
                  department: nextDepartment,
                  reassignmentReason: reason,
                  reassignedFromCategory: actionComplaint.category,
                  reassignedFromOffice: actionComplaint.department,
                  reassignedToCategory: selectedItem.category,
                  reassignedToOffice: nextDepartment,
                  reassignedAt,
                }
              : item
          )
          .filter((item) => item.department === departmentHeadDepartment)
      );

      if (selectedComplaint?.rawId === actionComplaint.rawId) {
        if (nextDepartment === departmentHeadDepartment) {
          setSelectedComplaint((prev) =>
            prev
              ? {
                  ...prev,
                  category: selectedItem.category,
                  department: nextDepartment,
                  reassignmentReason: reason,
                  reassignedFromCategory: actionComplaint.category,
                  reassignedFromOffice: actionComplaint.department,
                  reassignedToCategory: selectedItem.category,
                  reassignedToOffice: nextDepartment,
                  reassignedAt,
                }
              : prev
          );
        } else {
          closeDetails();
        }
      }

      setReassignModalVisible(false);
      setActionComplaint(null);
      setSelectedReassignTarget(null);
      setReassignmentReason("");

      notify(
        "Complaint Reassigned",
        `This complaint was reassigned to ${nextDepartment}. The citizen has been notified.`
      );

      writeAuditLog({
        action: "complaint_reassign",
        title: "Complaint Reassigned",
        description: `Complaint #${actionComplaint.id} was reassigned from ${actionComplaint.department} to ${nextDepartment}.`,
        entityType: "complaint",
        entityId: actionComplaint.rawId,
        actorRole: "moderator",
        metadata: {
          old_department: actionComplaint.department,
          new_department: nextDepartment,
          reason,
        },
      });

      loadAssignedComplaints(false);
    } catch (error) {
      console.log("Reassign complaint error:", error);
      notify("Reassign Failed", "Unable to reassign complaint.");
    } finally {
      setSubmittingReassignment(false);
    }
  };

  if (!fontsLoaded && !cachedAssigned) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.mainContainer}>
        <View style={styles.stickyHeader}>
          <View style={styles.headerContainer}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>Assigned Complaints</Text>
                <Text style={styles.headerSubtitle}>
                  {departmentHeadDepartment || "No department assigned in database"}
                </Text>
              </View>

              {canExportCsv ? (
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.exportCsvButton}
                  onPress={exportComplaintsToCsv}
                >
                  <Ionicons name="download-outline" size={16} color={WHITE} />
                  <Text style={styles.exportCsvButtonText}>CSV</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.filterGrid}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.filterPillFull}
              onPress={() => setCategoryDropdownVisible(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {selectedCategory}
              </Text>
              <Ionicons name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>

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
          <View style={styles.complaintsList}>
            {loadingComplaints && complaints.length === 0 ? (
              <ComplaintListSkeleton count={COMPLAINTS_PAGE_SIZE} />
            ) : filteredComplaints.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={30} color={MUTED} />
                <Text style={styles.emptyTitle}>No complaints found</Text>
                <Text style={styles.emptyText}>
                  Complaints will appear here when their assigned office matches your department in the database.
                </Text>
              </View>
            ) : (
              filteredComplaints.map((item) => {
                const statusStyle = getStatusStyle(item.status);
                const priorityStyle = getPriorityStyle(item.priority);

                return (
                  <View key={item.rawId || item.id} style={styles.complaintCard}>
                    <TouchableOpacity
                      activeOpacity={0.8}
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
                      </View>

                      <View style={styles.complaintCitizenRow}>
                        <View style={styles.cardCitizenAvatar}>
                          {item.userPhoto ? (
                            <Image
                              source={{ uri: item.userPhoto }}
                              style={styles.cardCitizenAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="person-circle-outline"
                              size={30}
                              color={GREEN}
                            />
                          )}
                        </View>

                        <View style={styles.cardCitizenTextBox}>
                          <Text style={styles.cardCitizenName} numberOfLines={1}>
                            {item.citizen}
                          </Text>
                          <Text style={styles.cardCitizenContact} numberOfLines={1}>
                            {item.contact}
                          </Text>
                        </View>
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
                    </TouchableOpacity>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[
                          styles.updateStatusButton,
                          (updatingStatusId === item.rawId ||
                            normalizeStatus(item.status) === "Completed") &&
                            styles.updateStatusButtonDisabled,
                        ]}
                        disabled={
                          updatingStatusId === item.rawId ||
                          normalizeStatus(item.status) === "Completed"
                        }
                        onPress={() => openUpdateStatusModal(item)}
                      >
                        {updatingStatusId === item.rawId ? (
                          <ActivityIndicator size="small" color={WHITE} />
                        ) : (
                          <MaterialCommunityIcons
                            name="progress-check"
                            size={15}
                            color={WHITE}
                          />
                        )}
                        <Text style={styles.updateStatusButtonText}>
                          {updatingStatusId === item.rawId
                            ? "Updating..."
                            : "Update Status"}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.reassignButton}
                        onPress={() => openReassignModal(item)}
                      >
                        <MaterialCommunityIcons
                          name="swap-horizontal"
                          size={16}
                          color={GREEN}
                        />
                        <Text style={styles.reassignButtonText}>Reassign</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <ComplaintsLoadMoreFooter loading={loadingMoreComplaints} />
        </ScrollView>

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

                  <Text style={styles.modalDescription}>
                    {selectedComplaint.description}
                  </Text>

                  <View style={styles.citizenDetailCard}>
                    <Text style={styles.sectionTitle}>Citizen Information</Text>

                    <View style={styles.citizenProfileRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() =>
                          selectedComplaint.userPhoto &&
                          openPhotoViewer(selectedComplaint.userPhoto)
                        }
                      >
                        <View style={styles.citizenAvatarBox}>
                          {selectedComplaint.userPhoto ? (
                            <Image
                              source={{ uri: selectedComplaint.userPhoto }}
                              style={styles.citizenAvatarImage}
                            />
                          ) : (
                            <Ionicons
                              name="person-circle-outline"
                              size={48}
                              color={GREEN}
                            />
                          )}
                        </View>
                      </TouchableOpacity>

                      <View style={styles.citizenTextBox}>
                        <Text style={styles.citizenName}>
                          {selectedComplaint.citizen}
                        </Text>
                        <Text style={styles.citizenContact}>
                          {selectedComplaint.contact}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.locationSection}>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionTitle}>Location</Text>

                      <TouchableOpacity
                        activeOpacity={0.75}
                        style={styles.smallTextButton}
                        onPress={openFullMap}
                      >
                        <Text style={styles.smallTextButtonText}>
                          Open Full Map
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.locationBox}>
                      <Text style={styles.locationLabel}>Pinned Location</Text>
                      <Text style={styles.locationValue}>
                        {selectedComplaint.geotaggedLocation}
                      </Text>
                    </View>

                    <View style={styles.mapBox}>
                      <WebView
                        ref={inlineMapRef}
                        originWhitelist={["*"]}
                        source={{
                          html: selectedMapHtml,
                          baseUrl: "https://api.maptiler.com/",
                        }}
                        javaScriptEnabled
                        domStorageEnabled
                        scrollEnabled={false}
                        onLoadEnd={() => injectDepartmentHeadMapUpdate(350)}
                        style={styles.mapWebView}
                      />
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.refreshLocationButton}
                      onPress={startDepartmentHeadTracking}
                    >
                      {locationLoading ? (
                        <ActivityIndicator size="small" color={GREEN} />
                      ) : (
                        <>
                          <Feather name="crosshair" size={15} color={GREEN} />
                          <Text style={styles.refreshLocationText}>
                            Update My Location
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.routeButton}
                      onPress={routeToPinnedLocation}
                    >
                      <Feather name="navigation" size={15} color={WHITE} />
                      <Text style={styles.routeButtonText}>
                        Route to Pinned Location
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.photoSection}>
                    <Text style={styles.sectionTitle}>Photo Evidence</Text>

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

                  <View style={styles.modalInfoCard}>
                    <Text style={styles.sectionTitle}>Complaint Information</Text>

                    <InfoRow label="Complaint ID" value={selectedComplaint.id} />
                    <InfoRow label="Category" value={selectedComplaint.category} />
                    <InfoRow label="Assigned Office" value={selectedComplaint.department} />
                    {!!selectedComplaint.reassignmentReason && (
                      <>
                        <InfoRow
                          label="Reassignment Reason"
                          value={selectedComplaint.reassignmentReason}
                        />
                        {!!selectedComplaint.reassignedFromOffice && (
                          <InfoRow
                            label="Previous Office"
                            value={selectedComplaint.reassignedFromOffice}
                          />
                        )}
                      </>
                    )}
                    <InfoRow label="Priority" value={selectedComplaint.priority} />
                    <InfoRow label="Status" value={selectedComplaint.status} />
                    <InfoRow label="Date Submitted" value={selectedComplaint.date} />
                    <InfoRow label="Time Submitted" value={selectedComplaint.time} last />
                  </View>
                </ScrollView>
              )}
            </View>

            {fullMapVisible && selectedComplaint && (
              <View style={styles.fullMapOverlay}>
                <View style={styles.fullMapHeader}>
                  <Text style={styles.fullMapTitle}>Complaint Map</Text>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.fullMapCloseButton}
                    onPress={closeFullMap}
                  >
                    <Feather name="x" size={23} color={TEXT} />
                  </TouchableOpacity>
                </View>

                <WebView
                  ref={fullMapRef}
                  originWhitelist={["*"]}
                  source={{
                    html: selectedMapHtml,
                    baseUrl: "https://api.maptiler.com/",
                  }}
                  javaScriptEnabled
                  domStorageEnabled
                  onLoadEnd={() => injectDepartmentHeadMapUpdate(450)}
                  style={styles.fullMapWebView}
                />

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.fullMapRouteButton}
                  onPress={routeToPinnedLocation}
                >
                  <Feather name="navigation" size={16} color={WHITE} />
                  <Text style={styles.fullMapRouteButtonText}>
                    Route to Pinned Location
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && detailsVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        <FullscreenPhotoViewer
          visible={photoViewerVisible && !detailsVisible}
          uri={selectedPhoto}
          onClose={closePhotoViewer}
        />

        <OptionModal
          visible={statusModalVisible}
          title="Update Status"
          subtitle={actionComplaint?.title}
          options={statusOptions.map((status) => ({
            main: status,
            sub: null,
            value: status,
          }))}
          selectedValue={actionComplaint?.status}
          onClose={() => {
            setStatusModalVisible(false);
            setActionComplaint(null);
          }}
          onSelect={(item) => selectStatus(item.value)}
        />

        <ReassignComplaintModal
          visible={reassignModalVisible}
          complaint={actionComplaint}
          options={CONCERN_DEPARTMENT_OPTIONS}
          selectedTarget={selectedReassignTarget}
          reason={reassignmentReason}
          submitting={submittingReassignment}
          onSelectTarget={setSelectedReassignTarget}
          onChangeReason={setReassignmentReason}
          onSubmit={submitReassignment}
          onClose={() => {
            setReassignModalVisible(false);
            setActionComplaint(null);
            setSelectedReassignTarget(null);
            setReassignmentReason("");
            setSubmittingReassignment(false);
          }}
        />
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

function OptionModal({
  visible,
  title,
  subtitle,
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
        <View style={styles.optionModalBox}>
          <View style={styles.dropdownHeader}>
            <View style={styles.optionModalTitleBox}>
              <Text style={styles.dropdownTitle}>{title}</Text>

              {!!subtitle && (
                <Text style={styles.optionModalSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Feather name="x" size={21} color={TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {options.map((item) => {
              const isSelected =
                selectedValue === item.main || selectedValue === item.value;

              return (
                <TouchableOpacity
                  key={item.main}
                  activeOpacity={0.75}
                  style={[
                    styles.reassignOption,
                    !item.sub && styles.statusOption,
                    isSelected && styles.dropdownOptionActive,
                  ]}
                  onPress={() => onSelect(item)}
                >
                  <View style={styles.reassignOptionTextBox}>
                    <Text
                      style={[
                        styles.reassignCategoryText,
                        isSelected && styles.dropdownOptionTextActive,
                      ]}
                    >
                      {item.main}
                    </Text>

                    {!!item.sub && (
                      <Text style={styles.reassignDepartmentText}>
                        {item.sub}
                      </Text>
                    )}
                  </View>

                  {isSelected && (
                    <Feather name="check" size={18} color={GREEN} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ReassignComplaintModal({
  visible,
  complaint,
  options,
  selectedTarget,
  reason,
  submitting,
  onSelectTarget,
  onChangeReason,
  onSubmit,
  onClose,
}) {
  const reassignScrollRef = useRef(null);

  const liftReasonInput = () => {
    setTimeout(() => {
      reassignScrollRef.current?.scrollToEnd({ animated: true });
    }, 280);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.centerModalOverlay}>
            <View style={styles.reassignModalBox}>
              <View style={styles.dropdownHeader}>
                <View style={styles.optionModalTitleBox}>
                  <Text style={styles.dropdownTitle}>Reassign Complaint</Text>
                  <Text style={styles.optionModalSubtitle} numberOfLines={1}>
                    {complaint?.title ||
                      "Choose a new category and provide a reason"}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    onClose();
                  }}
                  disabled={submitting}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                modal
                innerRef={reassignScrollRef}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={Keyboard.dismiss}
                contentContainerStyle={styles.reassignModalScrollContent}
              >
                <View style={styles.currentAssignmentBox}>
                  <Text style={styles.currentAssignmentLabel}>
                    Current Assignment
                  </Text>
                  <Text style={styles.currentAssignmentValue} numberOfLines={2}>
                    {complaint?.category || "Unclassified"}
                  </Text>
                  <Text style={styles.currentAssignmentOffice} numberOfLines={2}>
                    {complaint?.department || "Unassigned"}
                  </Text>
                </View>

                <Text style={styles.reassignFieldLabel}>New Category</Text>

                {options.map((item) => {
                  const isSelected =
                    selectedTarget?.category === item.category &&
                    selectedTarget?.department === item.department;

                  return (
                    <TouchableOpacity
                      key={item.category}
                      activeOpacity={0.75}
                      style={[
                        styles.reassignOption,
                        isSelected && styles.dropdownOptionActive,
                      ]}
                      onPress={() => onSelectTarget(item)}
                      disabled={submitting}
                    >
                      <View style={styles.reassignOptionTextBox}>
                        <Text
                          style={[
                            styles.reassignCategoryText,
                            isSelected && styles.dropdownOptionTextActive,
                          ]}
                        >
                          {item.category}
                        </Text>
                        <Text style={styles.reassignDepartmentText}>
                          {item.department}
                        </Text>
                      </View>

                      {isSelected && (
                        <Feather name="check" size={18} color={GREEN} />
                      )}
                    </TouchableOpacity>
                  );
                })}

                <Text style={styles.reassignFieldLabel}>
                  Reason for Reassignment
                </Text>

                <TextInput
                  style={styles.reassignmentReasonInput}
                  value={reason}
                  onChangeText={onChangeReason}
                  onFocus={liftReasonInput}
                  placeholder="Explain why this complaint should be transferred to another category or office..."
                  placeholderTextColor={MUTED}
                  multiline
                  textAlignVertical="top"
                  editable={!submitting}
                  maxLength={500}
                  returnKeyType="default"
                  blurOnSubmit={false}
                />

                <Text style={styles.reassignmentReasonCounter}>
                  {String(reason || "").trim().length}/500 characters
                </Text>
              </KeyboardAwareScrollView>

              <TouchableOpacity
                activeOpacity={0.82}
                style={[
                  styles.submitReassignmentButton,
                  submitting && styles.submitReassignmentButtonDisabled,
                ]}
                onPress={() => {
                  Keyboard.dismiss();
                  onSubmit();
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <>
                    <Feather name="send" size={15} color={WHITE} />
                    <Text style={styles.submitReassignmentText}>
                      Submit Reassignment
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
    </Modal>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "N/A"}</Text>
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

  stickyHeader: {
    backgroundColor: BG,
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
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
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  headerContainer: {
    marginBottom: 10,
  },

  headerTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  headerTextWrap: {
    flex: 1,
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: GREEN,
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  headerSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },

  exportCsvButton: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GREEN,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  exportCsvButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: WHITE,
  },

  filterGrid: {
    gap: 8,
    marginBottom: 0,
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

  complaintCitizenRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#FCFFFB",
    borderWidth: 1,
    borderColor: "#DDEFD8",
  },

  cardCitizenAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#D9EFD1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    overflow: "hidden",
  },

  cardCitizenAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
    resizeMode: "cover",
  },

  cardCitizenTextBox: {
    flex: 1,
  },

  cardCitizenName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.2,
    color: TEXT,
  },

  cardCitizenContact: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 1,
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

  badgeRowBeside: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 170,
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

  cardActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 11,
  },

  updateStatusButton: {
    flex: 1,
    height: 35,
    borderRadius: 18,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },

  updateStatusButtonDisabled: {
    backgroundColor: "#9BB89C",
  },

  updateStatusButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: WHITE,
  },

  reassignButton: {
    flex: 1,
    height: 35,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GREEN,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  reassignButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
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

  navIconWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 30,
    minHeight: 30,
  },

  notificationNavBadge: {
    position: "absolute",
    top: -5,
    right: -9,
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

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: WHITE,
    lineHeight: 11,
    textAlign: "center",
  },

  navLabel: {
    fontSize: 8.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
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
    textAlign: "center",
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
    textAlign: "center",
    marginTop: 3,
  },

  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  reassignKeyboardOverlay: {
    flex: 1,
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

  optionModalBox: {
    width: "100%",
    maxHeight: "76%",
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

  optionModalTitleBox: {
    flex: 1,
    paddingRight: 10,
  },

  dropdownTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: GREEN,
  },

  optionModalSubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    marginTop: 1,
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

  reassignOption: {
    minHeight: 58,
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 7,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  statusOption: {
    minHeight: 46,
  },

  reassignOptionTextBox: {
    flex: 1,
    paddingRight: 10,
  },

  reassignCategoryText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: TEXT,
  },

  reassignDepartmentText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
    lineHeight: 15,
  },

  reassignModalBox: {
    width: "100%",
    maxHeight: "72%",
    borderRadius: 22,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },

  reassignModalScrollContent: {
    paddingBottom: 12,
  },

  currentAssignmentBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },

  currentAssignmentLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
  },

  currentAssignmentValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: TEXT,
    marginTop: 2,
  },

  currentAssignmentOffice: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },

  reassignFieldLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
    marginBottom: 7,
    marginTop: 4,
  },

  reassignmentReasonInput: {
    minHeight: 104,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: TEXT,
    lineHeight: 18,
  },

  reassignmentReasonCounter: {
    alignSelf: "flex-end",
    fontFamily: "Poppins_500Medium",
    fontSize: 10,
    color: MUTED,
    marginTop: 5,
    marginBottom: 10,
  },

  submitReassignmentButton: {
    height: 43,
    borderRadius: 22,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
  },

  submitReassignmentButtonDisabled: {
    opacity: 0.7,
  },

  submitReassignmentText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.2,
    color: WHITE,
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

  modalDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: GREEN,
    marginBottom: 8,
  },

  citizenDetailCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 12,
  },

  citizenProfileRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  citizenAvatarBox: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: LIGHT_GREEN,
    borderWidth: 1,
    borderColor: "#D9EFD1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },

  citizenAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BG,
  },

  citizenTextBox: {
    flex: 1,
  },

  citizenName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: TEXT,
  },

  citizenContact: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: MUTED,
    marginTop: 3,
  },

  locationSection: {
    marginBottom: 15,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  smallTextButton: {
    paddingHorizontal: 10,
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  smallTextButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10.5,
    color: GREEN,
  },

  locationBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFE3B5",
    backgroundColor: "#FCFFFB",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
  },

  locationLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
  },

  locationValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13.2,
    lineHeight: 18,
    color: TEXT,
    marginTop: 2,
  },

  mapBox: {
    height: 220,
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },

  mapWebView: {
    flex: 1,
    backgroundColor: BG,
  },

  refreshLocationButton: {
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GREEN,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 9,
  },

  refreshLocationText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: GREEN,
  },

  routeButton: {
    height: 36,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 8,
  },

  routeButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: WHITE,
  },

  photoSection: {
    marginBottom: 15,
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

  modalInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 13,
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

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 16,
    marginTop: 1,
  },

  fullMapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 30,
    elevation: 30,
  },

  fullMapHeader: {
    height: Platform.OS === "ios" ? 92 : 84,
    paddingTop: Platform.OS === "ios" ? 34 : 26,
    paddingHorizontal: H_PADDING,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 60,
    elevation: 60,
  },

  fullMapTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: GREEN,
  },

  fullMapCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  fullMapWebView: {
    flex: 1,
    backgroundColor: BG,
  },

  fullMapRouteButton: {
    position: "absolute",
    left: H_PADDING,
    right: H_PADDING,
    bottom: Platform.OS === "ios" ? 34 : 24,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    zIndex: 80,
    elevation: 80,
  },

  fullMapRouteButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: WHITE,
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

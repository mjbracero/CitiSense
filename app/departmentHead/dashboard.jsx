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
import { WebView } from "react-native-webview";
import { ComplaintListSkeleton, PageSkeleton } from "../../components/skeletons";
import FullscreenPhotoViewer from "../../components/FullscreenPhotoViewer";
import {
  complaintAppliesToDepartment,
  CONCERN_DEPARTMENT_OPTIONS,
  getAssignedOffice,
  getCategoriesForDepartment,
  normalizeOfficeKey,
} from "../../lib/complaintCategories";
import { countComplaintsMany } from "../../lib/complaintCountService";
import { getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import {
  applyOffsetPagination,
  COMPLAINTS_PAGE_SIZE,
} from "../../lib/complaintPagination";
import {
  getProfileAvatarUrl,
  subscribeProfileAvatar,
} from "../../lib/profileAvatarStore";
import { supabase } from "../../lib/supabase";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
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
const DEPT_DASHBOARD_CACHE_KEY = "departmentHead.dashboard";

const DEFAULT_DEPARTMENT_HEAD_DEPARTMENT = "";

const MAPTILER_API_KEY =
  process.env.EXPO_PUBLIC_MAPTILER_API_KEY || "PASTE_YOUR_MAPTILER_API_KEY_HERE";

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

const AVATAR_BUCKET = "avatars";

const priorityFilters = [
  "All Priority",
  "Critical",
  "Urgent",
  "High",
  "Normal",
  "Low",
];

const dashboardCardConfig = [
  {
    title: "Assigned Complaints",
    countAll: true,
    icon: "clipboard-text-outline",
  },
  {
    title: "In Progress",
    statusNames: ["In Progress", "Returned"],
    icon: "progress-wrench",
  },
  {
    title: "For Validation",
    statusNames: ["For Validation"],
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

function normalizeOfficeName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStatus(status) {
  const clean = normalizeText(status);

  if (clean === "in_progress" || clean === "in progress") return "In Progress";
  if (clean === "for_validation" || clean === "for validation")
    return "For Validation";
  if (clean === "validation") return "For Validation";
  if (clean === "completed" || clean === "resolved") return "Completed";
  if (clean === "assigned") return "Assigned";
  if (clean === "pending") return "Pending";
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
  if (normalizedStatus === "Pending") return { bg: "#E8EEFF", color: BLUE };
  if (normalizedStatus === "In Progress")
    return { bg: "#FFF8D6", color: "#C9A000" };
  if (normalizedStatus === "For Validation")
    return { bg: "#F3EAFF", color: "#7A3EA8" };
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

function getGreetingByTime(date) {
  const hour = date.getHours();

  if (hour >= 0 && hour < 12) return "Maayong Buntag,";
  if (hour >= 12 && hour < 13) return "Maayong Udto,";
  if (hour >= 13 && hour < 18) return "Maayong Hapon,";

  return "Maayong Gabii,";
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
    latitude:
      row.latitude != null && row.latitude !== ""
        ? String(row.latitude).trim()
        : "",
    longitude:
      row.longitude != null && row.longitude !== ""
        ? String(row.longitude).trim()
        : "",
    date: formatDbDate(createdAt),
    time: formatDbTime(createdAt),
    createdAt,
    status: normalizeStatus(row.status || "Assigned"),
    priority: normalizePriority(row.priority, row.is_emergency),
    description: row.description || "No description provided.",
    citizen: row.citizen_name || profile.full_name || "Citizen",
    contact:
      row.contact_number || profile.contact_number || "No contact number",
    userPhoto:
      row.user_photo || row.citizen_photo || profile.avatar_url || null,
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

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createMapHtml({ latitude, longitude, address = "", title = "" }) {
  const complaintLat = Number(latitude);
  const complaintLng = Number(longitude);

  const hasComplaintLocation =
    Number.isFinite(complaintLat) && Number.isFinite(complaintLng);

  if (!hasComplaintLocation) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
          />
          <style>
            html,
            body {
              width: 100%;
              height: 100%;
              margin: 0;
              padding: 0;
              background: #f7faf6;
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #6f776f;
              text-align: center;
            }
          </style>
        </head>

        <body>
          <div>No valid pinned location coordinates.</div>
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
    </div>
  `.replace(/\n/g, "");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"
        />
        <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>

        <style>
          html,
          body,
          #map {
            height: 100%;
            width: 100%;
            margin: 0;
            padding: 0;
            background: #f7faf6;
          }

          .maplibregl-ctrl-attrib {
            font-size: 9px;
          }

          .maplibregl-popup-content {
            font-family: Arial, sans-serif;
            font-size: 12px;
            border-radius: 12px;
            padding: 10px 12px;
            max-width: 240px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          }

          .popup-card .popup-title {
            font-size: 12px;
            font-weight: 800;
            color: #171717;
            margin-bottom: 6px;
          }

          .popup-card .popup-label {
            font-size: 10px;
            font-weight: 700;
            color: #087A0D;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            margin-bottom: 2px;
          }

          .popup-card .popup-address {
            font-size: 12px;
            color: #333;
            line-height: 1.35;
            margin-bottom: 6px;
          }

          .popup-card .popup-coords {
            font-size: 10px;
            color: #6f776f;
          }

          .complaint-marker {
            width: 28px;
            height: 40px;
            display: block;
            background: transparent;
          }

          .complaint-marker svg {
            display: block;
            width: 28px;
            height: 40px;
            overflow: visible;
          }

          .map-error {
            height: 100%;
            width: 100%;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 18px;
            box-sizing: border-box;
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 13px;
            color: #6f776f;
            background: #f7faf6;
          }
        </style>
      </head>

      <body>
        <div id="map"></div>
        <div id="mapError" class="map-error">
          Map failed to load. Please check your internet connection or MapTiler API key.
        </div>

        <script>
          const mapContainer = document.getElementById("map");
          const errorContainer = document.getElementById("mapError");

          const complaintLng = ${complaintLng};
          const complaintLat = ${complaintLat};
          const popupHtml = ${JSON.stringify(popupHtml)};

          const showMapError = () => {
            mapContainer.style.display = "none";
            errorContainer.style.display = "flex";
          };

          try {
            const map = new maplibregl.Map({
              container: "map",
              style:
                "https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_API_KEY}",
              center: [complaintLng, complaintLat],
              zoom: 16,
              minZoom: 5,
              attributionControl: true,
              renderWorldCopies: false,
              fadeDuration: 0,
            });

            function lockCameraToComplaint() {
              map.jumpTo({
                center: [complaintLng, complaintLat],
                zoom: 16,
                bearing: 0,
                pitch: 0,
              });
            }

            map.on("style.load", () => {
              lockCameraToComplaint();
            });

            map.on("load", () => {
              lockCameraToComplaint();

              const complaintMarkerElement = document.createElement("div");
              complaintMarkerElement.className = "complaint-marker";
              complaintMarkerElement.innerHTML =
                '<svg viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                '<path d="M14 1.5C7.65 1.5 2.5 6.65 2.5 13c0 8.75 11.5 25.5 11.5 25.5S25.5 21.75 25.5 13C25.5 6.65 20.35 1.5 14 1.5z" fill="#d71920" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>' +
                '<circle cx="14" cy="13" r="4.2" fill="#ffffff"/>' +
                "</svg>";

              new maplibregl.Marker({
                element: complaintMarkerElement,
                anchor: "bottom",
                pitchAlignment: "map",
                rotationAlignment: "map",
              })
                .setLngLat([complaintLng, complaintLat])
                .setPopup(
                  new maplibregl.Popup({
                    offset: 24,
                    maxWidth: "260px",
                    closeButton: true,
                  }).setHTML(popupHtml)
                )
                .addTo(map)
                .togglePopup();

              setTimeout(() => {
                map.resize();
                lockCameraToComplaint();
              }, 300);
            });
          } catch (error) {
            showMapError();
          }
        </script>
      </body>
    </html>
  `;
}

export default function DepartmentHeadDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();

  const cachedDashboard = getPageCache(DEPT_DASHBOARD_CACHE_KEY);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [departmentHeadDepartment, setDepartmentHeadDepartment] = useState(
    cachedDashboard?.department ?? DEFAULT_DEPARTMENT_HEAD_DEPARTMENT
  );
  const [currentUserId, setCurrentUserId] = useState(
    cachedDashboard?.currentUserId ?? null
  );
  const [assignedComplaintsData, setAssignedComplaintsData] = useState(
    cachedDashboard?.complaints ?? []
  );
  const [dashboardCounts, setDashboardCounts] = useState(
    cachedDashboard?.counts ?? {
      total: 0,
      inProgress: 0,
      forValidation: 0,
      completed: 0,
    }
  );
  const [loadingComplaints, setLoadingComplaints] = useState(!cachedDashboard);

  const [selectedCategory, setSelectedCategory] = useState("All Category");
  const [selectedPriority, setSelectedPriority] = useState("All Priority");
  const [categoryDropdownVisible, setCategoryDropdownVisible] = useState(false);
  const [priorityDropdownVisible, setPriorityDropdownVisible] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState(
    getProfileAvatarUrl() || cachedDashboard?.profilePhotoUrl || null
  );

  useHideBottomNav(detailsVisible);

  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    return subscribeProfileAvatar((url) => {
      setProfilePhotoUrl(url);
      const prev = getPageCache(DEPT_DASHBOARD_CACHE_KEY) || {};
      setPageCache(DEPT_DASHBOARD_CACHE_KEY, {
        ...prev,
        profilePhotoUrl: url,
      });
    });
  }, []);

  const categoryFilters = useMemo(() => {
    const mappedCategories = getCategoriesForDepartment(departmentHeadDepartment);

    const categoriesFromComplaints = assignedComplaintsData
      .map((item) => item.category)
      .filter(Boolean);

    const uniqueCategories = Array.from(
      new Set([...mappedCategories, ...categoriesFromComplaints])
    );

    return ["All Category", ...uniqueCategories];
  }, [departmentHeadDepartment, assignedComplaintsData]);

  useEffect(() => {
    if (!categoryFilters.includes(selectedCategory)) {
      setSelectedCategory("All Category");
    }
  }, [categoryFilters, selectedCategory]);

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

  const loadDepartmentHeadDepartment = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        console.log("Moderator dashboard auth user missing:", userError);
        setCurrentUserId(null);
        setDepartmentHeadDepartment(DEFAULT_DEPARTMENT_HEAD_DEPARTMENT);
        return DEFAULT_DEPARTMENT_HEAD_DEPARTMENT;
      }

      const authEmail = String(user.email || "")
        .replace(/\s+/g, " ")
        .trim();

      setCurrentUserId(user.id);

      let profileData = null;

      const { data: profileByEmail, error: profileByEmailError } =
        await supabase
          .from("profiles")
          .select("id, email, role, department")
          .ilike("email", authEmail)
          .maybeSingle();

      if (profileByEmailError) {
        console.log(
          "Moderator dashboard profile by email load error:",
          profileByEmailError
        );
      } else {
        profileData = profileByEmail;
      }

      if (!profileData && user.id) {
        const { data: profileById, error: profileByIdError } = await supabase
          .from("profiles")
          .select("id, email, role, department")
          .eq("id", user.id)
          .maybeSingle();

        if (profileByIdError) {
          console.log(
            "Moderator dashboard profile by id load error:",
            profileByIdError
          );
        } else {
          profileData = profileById;
        }
      }

      const databaseDepartment = normalizeOfficeName(profileData?.department);

      const metadataDepartment = normalizeOfficeName(
        user.user_metadata?.department ||
          user.user_metadata?.assigned_office ||
          user.user_metadata?.office ||
          user.user_metadata?.department_name
      );

      const finalDepartment = databaseDepartment || metadataDepartment || "";

      setDepartmentHeadDepartment(finalDepartment);

      console.log("Moderator dashboard department resolved:", {
        authEmail,
        authUserId: user.id,
        profileEmail: profileData?.email || "",
        role: profileData?.role || "",
        databaseDepartment,
        metadataDepartment,
        finalDepartment,
      });

      return finalDepartment;
    } catch (error) {
      console.log("Load department head department error:", error);
      setDepartmentHeadDepartment(DEFAULT_DEPARTMENT_HEAD_DEPARTMENT);
      return DEFAULT_DEPARTMENT_HEAD_DEPARTMENT;
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
      console.log("Load citizen profiles skipped:", error);
      return {};
    }
  }, []);

  const loadAssignedComplaints = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader && shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY)) {
          setLoadingComplaints(true);
        }

        const department = await loadDepartmentHeadDepartment();
        const departmentKey = normalizeOfficeKey(department);

        if (!departmentKey) {
          console.log("Moderator dashboard has no department in profiles table.");
          if (shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY)) {
            setAssignedComplaintsData([]);
            setDashboardCounts({
              total: 0,
              inProgress: 0,
              forValidation: 0,
              completed: 0,
            });
          }
          return;
        }

        const officeFilter = (query) =>
          query.ilike("assigned_office", `%${department}%`);

        const counts = await countComplaintsMany([
          { key: "total", buildQuery: officeFilter },
          {
            key: "inProgress",
            buildQuery: (query) =>
              officeFilter(query).in("status", ["In Progress", "Returned"]),
          },
          {
            key: "forValidation",
            buildQuery: (query) =>
              officeFilter(query).eq("status", "For Validation"),
          },
          {
            key: "completed",
            buildQuery: (query) =>
              officeFilter(query).eq("status", "Completed"),
          },
        ]);

        setDashboardCounts(counts);
        setLoadingComplaints(false);

        const prevCounts = getPageCache(DEPT_DASHBOARD_CACHE_KEY) || {};
        setPageCache(DEPT_DASHBOARD_CACHE_KEY, {
          ...prevCounts,
          counts,
          department,
          currentUserId,
        });

        const { data, error } = await applyOffsetPagination(
          supabase
            .from("complaints")
            .select("*")
            .ilike("assigned_office", `%${department}%`)
            .order("created_at", { ascending: false }),
          0,
          COMPLAINTS_PAGE_SIZE
        );

        if (error) {
          console.log("Moderator dashboard complaints load error:", error);
          if (shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY)) {
            setAssignedComplaintsData([]);
          }
          return;
        }

        const matchedRows = (data || []).filter((row) =>
          complaintAppliesToDepartment(
            row.assigned_office,
            row.category || row.concern_category,
            department
          )
        );

        const citizenIds = Array.from(
          new Set(matchedRows.map((row) => row.citizen_id).filter(Boolean))
        );

        const profileMap = await loadCitizenProfiles(citizenIds);

        const mappedComplaints = await Promise.all(
          matchedRows.map((row) => mapComplaintRow(row, profileMap))
        );

        setAssignedComplaintsData(mappedComplaints);
        const prev = getPageCache(DEPT_DASHBOARD_CACHE_KEY) || {};
        setPageCache(DEPT_DASHBOARD_CACHE_KEY, {
          ...prev,
          counts,
          complaints: mappedComplaints,
          department,
          currentUserId,
        });
      } catch (error) {
        console.log("Load assigned complaints error:", error);
        if (shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY)) {
          setAssignedComplaintsData([]);
        }
      } finally {
        setLoadingComplaints(false);
      }
    },
    [currentUserId, loadCitizenProfiles, loadDepartmentHeadDepartment]
  );

  useFocusEffect(
    useCallback(() => {
      const cached = getPageCache(DEPT_DASHBOARD_CACHE_KEY);
      if (cached?.counts) {
        setDashboardCounts(cached.counts);
      }
      loadAssignedComplaints(true);
      registerPushTokenForCurrentUser();
    }, [loadAssignedComplaints])
  );

  useEffect(() => {
    if (!currentUserId) return;

    const complaintsChannel = supabase
      .channel(`moderator-dashboard-complaints-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "complaints",
        },
        () => {
          loadAssignedComplaints(false);
        }
      )
      .subscribe((status) => {
        console.log("Moderator dashboard complaints realtime status:", status);
      });

    const profilesChannel = supabase
      .channel(`moderator-dashboard-profile-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
        },
        () => {
          loadAssignedComplaints(false);
        }
      )
      .subscribe((status) => {
        console.log("Moderator dashboard profile realtime status:", status);
      });

    return () => {
      supabase.removeChannel(complaintsChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, [currentUserId, loadAssignedComplaints]);

  const greeting = useMemo(() => getGreetingByTime(currentDate), [currentDate]);

  const departmentComplaints = assignedComplaintsData;

  const dashboardCards = useMemo(() => {
    return dashboardCardConfig.map((card) => {
      const value = card.countAll
        ? dashboardCounts.total
        : card.title === "In Progress"
          ? dashboardCounts.inProgress
          : card.title === "For Validation"
            ? dashboardCounts.forValidation
            : card.title === "Completed"
              ? dashboardCounts.completed
              : 0;

      return {
        ...card,
        value,
      };
    });
  }, [dashboardCounts]);

  const filteredComplaints = useMemo(() => {
    const filtered = departmentComplaints.filter((item) => {
      const categoryMatch =
        selectedCategory === "All Category" || item.category === selectedCategory;

      const priorityMatch =
        selectedPriority === "All Priority" || item.priority === selectedPriority;

      return categoryMatch && priorityMatch;
    });

    return [...filtered].sort(
      (a, b) =>
        parseComplaintDateTime(b.date, b.time) -
        parseComplaintDateTime(a.date, a.time)
    );
  }, [departmentComplaints, selectedCategory, selectedPriority]);

  const displayedComplaints = useMemo(() => {
    return filteredComplaints.slice(0, 2);
  }, [filteredComplaints]);

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

  const openDetails = (complaint) => {
    setSelectedComplaint(complaint);
    setDetailsVisible(true);
    setPhotoViewerVisible(false);
    setSelectedPhoto(null);
  };

  const closeDetails = () => {
    setDetailsVisible(false);
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
    }, 180);
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

          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.avatarCircle}
            onPress={() => smoothNavigate("/departmentHead/profile")}
          >
            {profilePhotoUrl ? (
              <Image
                source={{ uri: profilePhotoUrl }}
                style={styles.avatar}
              />
            ) : (
              <Ionicons name="person" size={25} color={GREEN} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>{greeting}</Text>
            <Text style={styles.greetingLarge}>Department Head!</Text>
            <Text style={styles.officeText}>{departmentHeadDepartment || "No department assigned"}</Text>
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
            <Text style={styles.myComplaintsTitle}>Assigned Complaints</Text>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.viewAllRow}
              onPress={() => smoothNavigate("/departmentHead/assignedComplaints")}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Feather name="chevron-right" size={17} color={MUTED} />
            </TouchableOpacity>
          </View>

          <View style={styles.filterRow}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.filterPill}
              onPress={() => setCategoryDropdownVisible(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {selectedCategory}
              </Text>
              <Ionicons name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.filterPill}
              onPress={() => setPriorityDropdownVisible(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {selectedPriority}
              </Text>
              <Ionicons name="chevron-down" size={14} color={MUTED} />
            </TouchableOpacity>
          </View>

          <View style={styles.complaintsList}>
            {loadingComplaints && assignedComplaintsData.length === 0 ? (
              <ComplaintListSkeleton count={3} />
            ) : displayedComplaints.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={30} color={MUTED} />
                <Text style={styles.emptyTitle}>No complaints found</Text>
                <Text style={styles.emptyText}>
                  No assigned complaints are currently routed to your department in the database.
                </Text>
              </View>
            ) : (
              displayedComplaints.map((item) => {
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

                          <Text
                            style={styles.complaintLocation}
                            numberOfLines={2}
                          >
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
                          <Text
                            style={styles.cardCitizenContact}
                            numberOfLines={1}
                          >
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
                        style={styles.manageButton}
                        onPress={() =>
                          smoothNavigate(
                            "/departmentHead/assignedComplaints"
                          )
                        }
                      >
                        <MaterialCommunityIcons
                          name="progress-check"
                          size={15}
                          color={WHITE}
                        />
                        <Text style={styles.manageButtonText}>
                          Update Status
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.reassignButton}
                        onPress={() =>
                          smoothNavigate(
                            "/departmentHead/assignedComplaints"
                          )
                        }
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
                    <Text style={styles.modalSectionTitle}>
                      Citizen Information
                    </Text>

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
                    <Text style={styles.modalSectionTitle}>Location</Text>

                    <View style={styles.locationBox}>
                      <Text style={styles.locationLabel}>Pinned Location</Text>
                      <Text style={styles.locationValue}>
                        {selectedComplaint.geotaggedLocation}
                      </Text>

                      {selectedComplaint.latitude &&
                        selectedComplaint.longitude && (
                          <Text style={styles.locationCoordinates}>
                            {selectedComplaint.latitude},{" "}
                            {selectedComplaint.longitude}
                          </Text>
                        )}
                    </View>

                    <View style={styles.mapBox}>
                      <WebView
                        key={`dashboard-map-${selectedComplaint.rawId || selectedComplaint.id}`}
                        originWhitelist={["*"]}
                        source={{
                          html: selectedMapHtml,
                          baseUrl: "https://api.maptiler.com/",
                        }}
                        javaScriptEnabled
                        domStorageEnabled
                        scrollEnabled={false}
                        style={styles.mapWebView}
                      />
                    </View>
                  </View>

                  <View style={styles.photoSection}>
                    <Text style={styles.modalSectionTitle}>Photo Evidence</Text>

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
                    <Text style={styles.modalSectionTitle}>
                      Complaint Information
                    </Text>

                    <InfoRow label="Complaint ID" value={selectedComplaint.id} />
                    <InfoRow label="Category" value={selectedComplaint.category} />
                    <InfoRow
                      label="Assigned Office"
                      value={selectedComplaint.department}
                    />
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

        <FullscreenPhotoViewer
          visible={photoViewerVisible && !detailsVisible}
          uri={selectedPhoto}
          onClose={closePhotoViewer}
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

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  filterPill: {
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
    marginTop: 3,
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
  },

  statusBadge: {
    minWidth: 82,
    height: 24,
    borderRadius: 13,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 9.2,
  },

  priorityBadge: {
    minWidth: 58,
    height: 24,
    borderRadius: 13,
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

  manageButton: {
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

  manageButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: WHITE,
  },

  reassignButton: {
    height: 35,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: GREEN,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
  },

  reassignButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
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

  modalDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },

  modalSectionTitle: {
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

  locationCoordinates: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 5,
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
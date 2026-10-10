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
import WebView from "../../components/AppWebView";
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
import { loadCitizenProfiles } from "../../lib/citizenProfileCache";
import { resolveComplaintEvidencePhotoUrls } from "../../lib/complaintPhotoCache";
import {
  ensureDashboardCacheHydrated,
  getPageCache,
  setPageCache,
  shouldShowPageLoader,
} from "../../lib/pageDataCache";
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

// ===== [DEPT DASHBOARD] Constants: logo, colors, layout, cache key, map config =====
const { width: SCREEN_WIDTH } = Dimensions.get("window");

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

const H_PADDING = 20;
const CARD_GAP = 8;
const CARD_WIDTH = (SCREEN_WIDTH - H_PADDING * 2 - CARD_GAP * 3) / 4;
const DEPT_DASHBOARD_CACHE_KEY = "departmentHead.dashboard";

const DEFAULT_DEPARTMENT_HEAD_DEPARTMENT = "";

const MAPTILER_API_KEY =
  process.env.EXPO_PUBLIC_MAPTILER_API_KEY || "PASTE_YOUR_MAPTILER_API_KEY_HERE";

const PHOTO_PLACEHOLDER =
  "https://placehold.co/900x600/eaf6e4/087a0d?text=CitiSense+Complaint";

// ===== [DEPT DASHBOARD] Filter options, dashboard card config, bottom tabs =====
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
    filter: "All Status",
    icon: "clipboard-text-outline",
    accent: "rgba(8, 122, 13, 1)",
    background: "rgba(255, 255, 255, 1)",
    border: "rgba(226, 231, 224, 1)",
  },
  {
    title: "In Progress",
    statusNames: ["In Progress", "Returned"],
    filter: "In Progress",
    icon: "progress-wrench",
    accent: "rgba(8, 122, 13, 1)",
    background: "rgba(255, 255, 255, 1)",
    border: "rgba(226, 231, 224, 1)",
  },
  {
    title: "For Validation",
    statusNames: ["For Validation"],
    filter: "For Validation",
    icon: "account-check-outline",
    accent: "rgba(8, 122, 13, 1)",
    background: "rgba(255, 255, 255, 1)",
    border: "rgba(226, 231, 224, 1)",
  },
  {
    title: "Completed",
    statusNames: ["Completed"],
    filter: "Completed",
    icon: "check-circle-outline",
    accent: "rgba(8, 122, 13, 1)",
    background: "rgba(255, 255, 255, 1)",
    border: "rgba(226, 231, 224, 1)",
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

// ===== [DEPT DASHBOARD] Helpers: normalize text/office/status/priority, badge styles =====
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

  if (normalizedStatus === "Assigned") return { bg: "rgba(232, 238, 255, 1)", color: "rgba(49, 90, 154, 1)" };
  if (normalizedStatus === "Pending") return { bg: "rgba(232, 238, 255, 1)", color: "rgba(49, 90, 154, 1)" };
  if (normalizedStatus === "In Progress")
    return { bg: "rgba(255, 248, 214, 1)", color: "rgba(201, 160, 0, 1)" };
  if (normalizedStatus === "For Validation")
    return { bg: "rgba(243, 234, 255, 1)", color: "rgba(122, 62, 168, 1)" };
  if (normalizedStatus === "Completed") return { bg: "rgba(223, 240, 223, 1)", color: "rgba(8, 122, 13, 1)" };
  if (normalizedStatus === "Returned") return { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" };

  return { bg: "rgba(241, 241, 241, 1)", color: "rgba(111, 119, 111, 1)" };
}

function getPriorityStyle(priority) {
  const normalizedPriority = normalizePriority(priority);

  if (normalizedPriority === "Critical") return { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" };
  if (normalizedPriority === "Urgent") return { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" };
  if (normalizedPriority === "High") return { bg: "rgba(255, 242, 232, 1)", color: "rgba(244, 162, 76, 1)" };
  if (normalizedPriority === "Normal") return { bg: "rgba(234, 246, 228, 1)", color: "rgba(8, 122, 13, 1)" };
  if (normalizedPriority === "Low") return { bg: "rgba(241, 244, 241, 1)", color: "rgba(111, 119, 111, 1)" };

  return { bg: "rgba(234, 246, 228, 1)", color: "rgba(8, 122, 13, 1)" };
}

// ===== [DEPT DASHBOARD] Helpers: greeting and date/time formatting =====
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

// ===== [DEPT DASHBOARD] Map DB complaint row -> UI complaint object =====
async function resolveComplaintPhotoUrls(row) {
  return resolveComplaintEvidencePhotoUrls(row);
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

// ===== [DEPT DASHBOARD] Map HTML builder (MapTiler WebView) =====
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
              background: rgba(247, 250, 246, 1);
              font-family: Arial, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              color: rgba(111, 119, 111, 1);
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
            background: rgba(247, 250, 246, 1);
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
            color: rgba(23, 23, 23, 1);
            margin-bottom: 6px;
          }

          .popup-card .popup-label {
            font-size: 10px;
            font-weight: 700;
            color: rgba(8, 122, 13, 1);
            text-transform: uppercase;
            letter-spacing: 0.3px;
            margin-bottom: 2px;
          }

          .popup-card .popup-address {
            font-size: 12px;
            color: rgba(51, 51, 51, 1);
            line-height: 1.35;
            margin-bottom: 6px;
          }

          .popup-card .popup-coords {
            font-size: 10px;
            color: rgba(111, 119, 111, 1);
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
            color: rgba(111, 119, 111, 1);
            background: rgba(247, 250, 246, 1);
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
                '<path d="M14 1.5C7.65 1.5 2.5 6.65 2.5 13c0 8.75 11.5 25.5 11.5 25.5S25.5 21.75 25.5 13C25.5 6.65 20.35 1.5 14 1.5z" fill="rgba(215, 25, 32, 1)" stroke="rgba(255, 255, 255, 1)" stroke-width="2.5" stroke-linejoin="round"/>' +
                '<circle cx="14" cy="13" r="4.2" fill="rgba(255, 255, 255, 1)"/>' +
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

// ===== [DEPT DASHBOARD] Screen component =====
export default function DepartmentHeadDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();

  // --- [DEPT DASHBOARD] State: cached data, counts, filters, modals, avatar ---
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
  const [loadingComplaints, setLoadingComplaints] = useState(
    !cachedDashboard?.counts
  );

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

  // --- [DEPT DASHBOARD] Refs and fonts ---
  const navigationLockRef = useRef(false);
  const navigationUnlockTimerRef = useRef(null);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [DEPT DASHBOARD] Profile avatar subscription ---
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

  // --- [DEPT DASHBOARD] Category filter options ---
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

  // --- [DEPT DASHBOARD] Navigation helper (debounced) ---
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

  // --- [DEPT DASHBOARD] Clock tick for greeting ---
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // --- [DEPT DASHBOARD] Load department head's department from profile ---
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

  // --- [DEPT DASHBOARD] Load assigned complaints and counts from Supabase ---
  const loadAssignedComplaints = useCallback(
    async (showLoader = true) => {
      try {
        if (showLoader && shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY)) {
          setLoadingComplaints(true);
        }

        const department = await loadDepartmentHeadDepartment();
        const departmentKey = normalizeOfficeKey(department);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const resolvedUserId =
          session?.user?.id ||
          currentUserId ||
          getPageCache(DEPT_DASHBOARD_CACHE_KEY)?.currentUserId;

        if (!departmentKey) {
          console.log("Moderator dashboard has no department in profiles table.");
          if (
            shouldShowPageLoader(DEPT_DASHBOARD_CACHE_KEY) &&
            !getPageCache(DEPT_DASHBOARD_CACHE_KEY)?.counts
          ) {
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
          currentUserId: resolvedUserId || prevCounts.currentUserId,
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
          currentUserId: resolvedUserId || prev.currentUserId,
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
    [currentUserId, loadDepartmentHeadDepartment]
  );

  // --- [DEPT DASHBOARD] On focus: restore cache, refresh, register push token ---
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const restoreAndRefresh = async () => {
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          const userId = session?.user?.id;

          if (userId) {
            const cached = await ensureDashboardCacheHydrated(
              userId,
              DEPT_DASHBOARD_CACHE_KEY
            );
            if (cancelled) return;

            if (cached?.counts) {
              setDashboardCounts(cached.counts);
              setLoadingComplaints(false);
            }
            if (Array.isArray(cached?.complaints) && cached.complaints.length) {
              setAssignedComplaintsData(cached.complaints);
            }
            if (cached?.department) {
              setDepartmentHeadDepartment(cached.department);
            }
            if (cached?.currentUserId) {
              setCurrentUserId(cached.currentUserId);
            }
          } else {
            const cached = getPageCache(DEPT_DASHBOARD_CACHE_KEY);
            if (cached?.counts) {
              setDashboardCounts(cached.counts);
              setLoadingComplaints(false);
            }
          }
        } catch (error) {
          console.log("Moderator dashboard cache restore error:", error);
        }

        if (!cancelled) {
          loadAssignedComplaints(true);
          registerPushTokenForCurrentUser();
        }
      };

      restoreAndRefresh();

      return () => {
        cancelled = true;
      };
    }, [loadAssignedComplaints])
  );

  // --- [DEPT DASHBOARD] Realtime subscriptions ---
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

  // --- [DEPT DASHBOARD] Derived: greeting, dashboard cards, filtered complaints, map HTML ---
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

  // --- [DEPT DASHBOARD] Details modal and photo viewer handlers ---
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

  // --- [DEPT DASHBOARD] Render ---
  if (!fontsLoaded && !cachedDashboard?.counts) {
    return <PageSkeleton variant="dashboard" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [DEPT DASHBOARD UI] Fixed header: logo and profile avatar */}
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
              <Ionicons name="person" size={25} color="rgba(8, 122, 13, 1)" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* [DEPT DASHBOARD UI] Greeting and department name */}
          <View style={styles.greetingContainer}>
            <Text style={styles.greetingSmall}>{greeting}</Text>
            <Text style={styles.greetingLarge}>Department Head!</Text>
            <Text style={styles.officeText}>{departmentHeadDepartment || "No department assigned"}</Text>
          </View>

          {/* [DEPT DASHBOARD UI] Dashboard status count cards */}
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
                  item.background && { backgroundColor: item.background },
                  item.border && { borderColor: item.border },
                ]}
                onPress={() =>
                  smoothNavigate({
                    pathname: "/departmentHead/assignedComplaints",
                    params: { filter: item.filter },
                  })
                }
              >
                <View
                  style={[
                    styles.cardIconCircle,
                    item.accent && { backgroundColor: item.accent },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={23}
                    color="rgba(255, 255, 255, 1)"
                  />
                </View>

                <Text style={[styles.cardTitle, item.accent && { color: item.accent }]}>
                  {item.title}
                </Text>
                <Text style={[styles.cardValue, item.accent && { color: item.accent }]}>
                  {item.value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* [DEPT DASHBOARD UI] Assigned Complaints heading with View All */}
          <View style={styles.sectionRow}>
            <Text style={styles.myComplaintsTitle}>Assigned Complaints</Text>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.viewAllRow}
              onPress={() => smoothNavigate("/departmentHead/assignedComplaints")}
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Feather name="chevron-right" size={17} color="rgba(111, 119, 111, 1)" />
            </TouchableOpacity>
          </View>

          {/* [DEPT DASHBOARD UI] Filters: category and priority dropdowns */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.filterPill}
              onPress={() => setCategoryDropdownVisible(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {selectedCategory}
              </Text>
              <Ionicons name="chevron-down" size={14} color="rgba(111, 119, 111, 1)" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.filterPill}
              onPress={() => setPriorityDropdownVisible(true)}
            >
              <Text style={styles.filterText} numberOfLines={1}>
                {selectedPriority}
              </Text>
              <Ionicons name="chevron-down" size={14} color="rgba(111, 119, 111, 1)" />
            </TouchableOpacity>
          </View>

          {/* [DEPT DASHBOARD UI] Complaints list: skeleton, empty state, or cards */}
          <View style={styles.complaintsList}>
            {loadingComplaints && assignedComplaintsData.length === 0 ? (
              <ComplaintListSkeleton count={3} />
            ) : displayedComplaints.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="document-text-outline" size={30} color="rgba(111, 119, 111, 1)" />
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
                      {/* [DEPT DASHBOARD UI] Card: title and location */}
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

                      {/* [DEPT DASHBOARD UI] Card: citizen avatar and contact */}
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
                              color="rgba(8, 122, 13, 1)"
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

                      {/* [DEPT DASHBOARD UI] Card: date/time and status/priority badges */}
                      <View style={styles.metaAndBadgeRow}>
                        <View style={styles.dateTimeColumn}>
                          <View style={styles.metaItem}>
                            <Feather name="calendar" size={12} color="rgba(111, 119, 111, 1)" />
                            <Text style={styles.metaText}>{item.date}</Text>
                          </View>

                          <View style={styles.metaItem}>
                            <Feather name="clock" size={12} color="rgba(111, 119, 111, 1)" />
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

                    {/* [DEPT DASHBOARD UI] Card actions: go to Assigned Complaints */}
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
                          color="rgba(255, 255, 255, 1)"
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
                          color="rgba(8, 122, 13, 1)"
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

        {/* [DEPT DASHBOARD UI] Filter dropdown modals (category, priority) */}
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

        {/* [DEPT DASHBOARD UI] Complaint details modal */}
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
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
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

                  {/* [DEPT DASHBOARD UI] Details: citizen information */}
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
                              color="rgba(8, 122, 13, 1)"
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

                  {/* [DEPT DASHBOARD UI] Details: location and map */}
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

                  {/* [DEPT DASHBOARD UI] Details: photo evidence */}
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
                        <Ionicons name="image-outline" size={34} color="rgba(111, 119, 111, 1)" />
                        <Text style={styles.noPhotoText}>
                          No photo evidence available
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* [DEPT DASHBOARD UI] Details: complaint information rows */}
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

            {/* [DEPT DASHBOARD UI] Photo viewer (inside details modal) */}
            <FullscreenPhotoViewer
              variant="overlay"
              visible={photoViewerVisible && detailsVisible}
              uri={selectedPhoto}
              onClose={closePhotoViewer}
            />
          </View>
        </Modal>

        {/* [DEPT DASHBOARD UI] Photo viewer (outside details modal) */}
        <FullscreenPhotoViewer
          visible={photoViewerVisible && !detailsVisible}
          uri={selectedPhoto}
          onClose={closePhotoViewer}
        />
      </View>
    </SafeAreaView>
  );
}

// ===== [DEPT DASHBOARD] Subcomponent: DropdownModal (filter picker) =====
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
              <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
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
                  <Feather name="check" size={18} color="rgba(8, 122, 13, 1)" />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ===== [DEPT DASHBOARD] Subcomponent: InfoRow =====
function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "N/A"}</Text>
    </View>
  );
}

// ===== [DEPT DASHBOARD] Styles =====
const styles = StyleSheet.create({
  // --- Layout ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  loader: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  // --- Header: logo and avatar ---
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
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.1,
  },

  logoTextLight: {
    color: "rgba(109, 187, 63, 1)",
  },

  avatarCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
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

  // --- Greeting and section titles ---
  greetingContainer: {
    marginBottom: 16,
  },

  greetingSmall: {
    fontFamily: "Poppins_700Bold",
    fontSize: 19,
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.4,
  },

  greetingLarge: {
    fontFamily: "Poppins_700Bold",
    fontSize: 29,
    color: "rgba(8, 122, 13, 1)",
    lineHeight: 35,
    letterSpacing: 0.3,
  },

  officeText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: "rgba(111, 119, 111, 1)",
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
    color: "rgba(8, 122, 13, 1)",
  },

  myComplaintsTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 22,
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.2,
  },

  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  viewAllText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    marginRight: 2,
  },

  // --- Dashboard cards ---
  dashboardCardsRow: {
    flexDirection: "row",
    marginBottom: 19,
  },

  dashboardCard: {
    height: 138,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    paddingTop: 12,
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  cardIconCircle: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.2,
    color: "rgba(8, 122, 13, 1)",
    textAlign: "center",
    lineHeight: 14,
    height: 34,
    paddingHorizontal: 2,
  },

  cardValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 31,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 0,
    lineHeight: 36,
  },

  // --- Filters ---
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
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
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
    color: "rgba(23, 23, 23, 1)",
  },

  // --- Complaint cards ---
  complaintsList: {
    marginTop: 3,
    gap: 10,
  },

  complaintCard: {
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "rgba(0, 0, 0, 1)",
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
    color: "rgba(23, 23, 23, 1)",
  },

  complaintLocation: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
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
    backgroundColor: "rgba(252, 255, 251, 1)",
    borderWidth: 1,
    borderColor: "rgba(221, 239, 216, 1)",
  },

  cardCitizenAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
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
    color: "rgba(23, 23, 23, 1)",
  },

  cardCitizenContact: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
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
    color: "rgba(23, 23, 23, 1)",
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

  // --- Card actions ---
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
    backgroundColor: "rgba(8, 122, 13, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },

  manageButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(255, 255, 255, 1)",
  },

  reassignButton: {
    height: 35,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(8, 122, 13, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 12,
  },

  reassignButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Empty state ---
  emptyCard: {
    minHeight: 130,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  emptyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 8,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    marginTop: 3,
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
    backgroundColor: "rgba(215, 25, 32, 1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: "rgba(255, 255, 255, 1)",
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

  // --- Dropdown modal ---
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
    backgroundColor: "rgba(255, 255, 255, 1)",
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
    color: "rgba(8, 122, 13, 1)",
  },

  dropdownOption: {
    minHeight: 46,
    borderRadius: 13,
    paddingHorizontal: 12,
    marginBottom: 7,
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dropdownOptionActive: {
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderColor: "rgba(191, 227, 181, 1)",
  },

  dropdownOptionText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(23, 23, 23, 1)",
    paddingRight: 8,
  },

  dropdownOptionTextActive: {
    fontFamily: "Poppins_700Bold",
    color: "rgba(8, 122, 13, 1)",
  },

  // --- Details modal ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  detailsSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
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

  modalComplaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "rgba(23, 23, 23, 1)",
  },

  modalDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(51, 51, 51, 1)",
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },

  modalSectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 8,
  },

  citizenDetailCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
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
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(217, 239, 209, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },

  citizenAvatarImage: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  citizenTextBox: {
    flex: 1,
  },

  citizenName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "rgba(23, 23, 23, 1)",
  },

  citizenContact: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 3,
  },

  // --- Location and map ---
  locationSection: {
    marginBottom: 15,
  },

  locationBox: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
  },

  locationLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
  },

  locationValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13.2,
    lineHeight: 18,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 2,
  },

  locationCoordinates: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 5,
  },

  mapBox: {
    height: 220,
    borderRadius: 15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  mapWebView: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  // --- Photo evidence ---
  photoSection: {
    marginBottom: 15,
  },

  noPhotoBox: {
    height: 90,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  noPhotoText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
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
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
  },

  // --- Info rows ---
  modalInfoCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
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
    color: "rgba(8, 122, 13, 1)",
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(23, 23, 23, 1)",
    lineHeight: 16,
    marginTop: 1,
  },

  // --- Photo viewer ---
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
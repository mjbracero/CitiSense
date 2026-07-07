import { Feather, FontAwesome5, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { Image as ExpoImage } from "expo-image";
import * as Location from "expo-location";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  Image,
  InteractionManager,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveCommonAddress } from "../../lib/addressUtils";
import {
  getProfileDisplayName,
  notifyAdminsNewComplaint,
} from "../../lib/adminNotificationService";
import { isInsideBogoCity } from "../../lib/bogoCityBounds";
import { HEADER_TOP_SPACING } from "../../constants/screenLayout";
import ComplaintMapView from "../../components/ComplaintMapView";
import { notifyDepartmentHeadsNewAssignment } from "../../lib/departmentHeadNotificationService";
import { notifyCitizenDuplicateSubmission } from "../../lib/citizenNotificationService";
import { isLocationUsageAllowed } from "../../lib/locationPreferences";
import {
  analyzeComplaint,
  getDuplicateWarningMessage,
  shouldWarnAboutDuplicate,
} from "../../lib/complaintAnalysisService";
import {
  getComplaintRejectionMessage,
  isComplaintAnalysisRejected,
} from "../../lib/complaintContentModeration";
import { supabase } from "../../lib/supabase";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const GREEN = "#087A0D";
const SOFT_GREEN = "#EAF6E4";
const RED = "#D71920";
const DARK_RED = "#B71C1C";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";

const H_PADDING = 18;
const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const INPUT_ABOVE_TABS_BOTTOM = Platform.OS === "ios" ? 78 : 70;
const MESSAGE_INPUT_HEIGHT = 64;
const PH_MOBILE_REGEX = /^09\d{9}$/;

function sanitizePhilippineMobileInput(text) {
  const digits = text.replace(/\D/g, "").slice(0, 11);

  if (!digits) return "";

  if (digits.startsWith("09")) {
    return digits;
  }

  if (digits.startsWith("9")) {
    return `0${digits}`.slice(0, 11);
  }

  if (digits.startsWith("0")) {
    return `09${digits.slice(1)}`.slice(0, 11);
  }

  return `09${digits}`.slice(0, 11);
}

function isValidPhilippineMobile(number) {
  return PH_MOBILE_REGEX.test(String(number || "").replace(/\D/g, ""));
}

function getContactNumberErrorMessage() {
  return "Contact number must start with 09 and be exactly 11 digits.";
}

const BOT_LOGO = require("../../assets/images/botlogo.png");

const DEFAULT_REGION = {
  latitude: 11.0517,
  longitude: 124.0055,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};


const departmentByCategory = {
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
      "fire hazard",
      "gas leak",
      "explosion",
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
      "electrical",
      "transformer",
      "power outage",
      "walay kuryente",
      "electric post",
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
    ],
  },
];

const emergencyKeywords = [
  "fire",
  "sunog",
  "murder",
  "killing",
  "kill",
  "stab",
  "stabbing",
  "shoot",
  "shooting",
  "gun",
  "drowning",
  "drown",
  "nalumos",
  "lunod",
  "accident",
  "crash",
  "bleeding",
  "unconscious",
  "rescue",
  "earthquake",
  "landslide",
  "attack",
  "violence",
  "medical emergency",
  "heart attack",
  "stroke",
  "explosion",
  "bomba",
  "riot",
  "hostage",
  "suicide",
  "emergency",
];

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/citizen/dashboard",
    activePath: "citizen/dashboard",
    flex: 0.85,
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
    flex: 0.85,
  },
];

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function formatRecordingTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function detectEmergency(text) {
  const lowerText = text.toLowerCase();
  return emergencyKeywords.some((keyword) => lowerText.includes(keyword));
}

function classifyComplaintTitle(title) {
  return detectEmergency(title) ? "emergency" : "non-emergency";
}

function detectComplaintCategory(title, description = "") {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();

  for (const item of categoryKeywords) {
    const matched = item.keywords.some((keyword) =>
      combinedText.includes(keyword.toLowerCase())
    );

    if (matched) {
      return item.category;
    }
  }

  return "Unclassified";
}

const EMERGENCY_HOTLINES = {
  national: {
    title: "Call Emergency Hotline",
    number: "911",
    icon: "call",
    iconSet: "ion",
  },
  cbdrrmo: {
    title: "Call CBDRRMO",
    number: "0945 685 2435",
    icon: "ambulance",
    iconSet: "fa5",
  },
  police: {
    title: "Call Bogo City Police Station",
    number: "0905 600 2028",
    icon: "shield",
    iconSet: "ion",
  },
  fire: {
    title: "Call Bogo City Fire Station",
    number: "0917 127 9158",
    icon: "flame",
    iconSet: "ion",
  },
};

function complaintNeedsPolice(title, description = "") {
  return (
    detectComplaintCategory(title, description) === "Peace and Order Concerns"
  );
}

function complaintNeedsFire(title, description = "") {
  return detectComplaintCategory(title, description) === "Fire Safety Concerns";
}

function dialHotline(phoneNumber) {
  const dialNumber = phoneNumber.replace(/\s/g, "");

  Linking.openURL(`tel:${dialNumber}`).catch(() => {
    Alert.alert("Call Failed", "Unable to open the phone dialer.");
  });
}

function getAssignedOffice(category, existingOffice = null) {
  if (existingOffice && existingOffice !== "Unassigned") {
    return existingOffice;
  }

  return departmentByCategory[category] || "Unassigned";
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

function getPhotoExtension(uri = "", mimeType = "") {
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

function getPhotoContentType(extension) {
  if (extension === "png") return "image/png";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  return "image/jpeg";
}

async function preparePickedPhotoAsset(asset) {
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
      fileName: asset.fileName || "Selected photo",
      fileSize: asset.fileSize || 0,
      mimeType: "image/jpeg",
    };
  } catch (error) {
    console.log("Prepare picked photo error:", error);
    return null;
  }
}

async function readPhotoForUpload(photo) {
  if (!photo?.uri) {
    throw new Error("Selected photo has no file URI.");
  }

  const fileInfo = await FileSystem.getInfoAsync(photo.uri, {
    size: true,
  });

  if (!fileInfo.exists) {
    throw new Error("The selected photo could not be prepared for upload.");
  }

  if (fileInfo.size && fileInfo.size > MAX_PHOTO_SIZE) {
    throw new Error(
      "The compressed photo is still too large. Please choose a smaller photo."
    );
  }

  const response = await fetch(photo.uri);

  if (!response.ok) {
    throw new Error("The selected photo could not be read for upload.");
  }

  const arrayBuffer = await response.arrayBuffer();

  return {
    arrayBuffer,
    contentType: "image/jpeg",
    extension: "jpg",
  };
}

export default function CitizenSubmit() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const scrollViewRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const textInputRef = useRef(null);
  const isMountedRef = useRef(true);
  const isSubmittingRef = useRef(false);
  const bogoWarningShownRef = useRef(false);
  const processedPhotoUrisRef = useRef(new Set());
  const isPreparingPhotosRef = useRef(false);
  const selectedPhotosRef = useRef([]);

  const [message, setMessage] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceNoteUri, setVoiceNoteUri] = useState(null);

  const [chatStep, setChatStep] = useState(0);
  const [isEmergency, setIsEmergency] = useState(false);
  const [complaintType, setComplaintType] = useState(null);

  const [complaintTitle, setComplaintTitle] = useState("");
  const [complaintDescription, setComplaintDescription] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [titleMessage, setTitleMessage] = useState(null);
  const [descriptionMessage, setDescriptionMessage] = useState(null);
  const [contactMessage, setContactMessage] = useState(null);

  const [confirmedLocation, setConfirmedLocation] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_REGION);
  const [locationText, setLocationText] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [screenStartTime] = useState(new Date());
  const [currentDate, setCurrentDate] = useState(new Date());
  const [complaintCapturedAt, setComplaintCapturedAt] = useState(null);
  const [reviewEditField, setReviewEditField] = useState(null);
  const [reviewDraft, setReviewDraft] = useState({
    title: "",
    description: "",
    contact: "",
  });

  const hasSelectedPhotos = selectedPhotos.length > 0;
  const shouldShowInput = chatStep < 3;

  useEffect(() => {
    selectedPhotosRef.current = selectedPhotos;
  }, [selectedPhotos]);
  const isKeyboardOpen = keyboardHeight > 0;

  const submittedDateTime = useMemo(() => {
    const stamp = complaintCapturedAt || currentDate;
    return `${formatDateTime(stamp)} ${formatTime(stamp)}`;
  }, [complaintCapturedAt, currentDate]);

  const keyboardOffset =
    Platform.OS === "ios"
      ? Math.max(keyboardHeight - insets.bottom, 0)
      : keyboardHeight;

  const inputBottom = isKeyboardOpen
    ? keyboardOffset
    : INPUT_ABOVE_TABS_BOTTOM;

  const scrollBottomPadding = shouldShowInput
    ? Math.max(210, inputBottom + MESSAGE_INPUT_HEIGHT + 28)
    : reviewEditField
      ? Math.max(180, keyboardOffset + 100)
      : 125;

  const formattedDate = useMemo(
    () => getFormattedDate(currentDate),
    [currentDate]
  );

  const isOutsideBogoCity = useMemo(
    () =>
      !isInsideBogoCity(
        selectedLocation.latitude,
        selectedLocation.longitude
      ),
    [selectedLocation.latitude, selectedLocation.longitude]
  );

  const emergencyHotlines = useMemo(() => {
    const hotlines = [
      EMERGENCY_HOTLINES.national,
      EMERGENCY_HOTLINES.cbdrrmo,
    ];

    if (complaintNeedsPolice(complaintTitle, complaintDescription)) {
      hotlines.push(EMERGENCY_HOTLINES.police);
    }

    if (complaintNeedsFire(complaintTitle, complaintDescription)) {
      hotlines.push(EMERGENCY_HOTLINES.fire);
    }

    return hotlines;
  }, [complaintTitle, complaintDescription]);

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/citizen/dashboard");
  };

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated });
    });
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasSelectedPhotos) {
      if (!complaintCapturedAt) {
        setComplaintCapturedAt(new Date());
      }

      locateUser();
    }
  }, [hasSelectedPhotos]);

  useEffect(() => {
    if (chatStep === 2 && shouldShowInput) {
      textInputRef.current?.blur();
      Keyboard.dismiss();

      const timer = setTimeout(() => {
        textInputRef.current?.focus();
      }, 450);

      return () => clearTimeout(timer);
    }
  }, [chatStep, shouldShowInput]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        setKeyboardHeight(event.endCoordinates.height);

        setTimeout(() => {
          scrollToBottom(true);
        }, Platform.OS === "ios" ? 120 : 180);
      }
    );

    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        setKeyboardHeight(0);

        setTimeout(() => {
          scrollToBottom(false);
        }, 120);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [recording]);

  const updateAddressFromCoords = async (coords, shouldSetConfirmed = false) => {
    const nextAddress = await resolveCommonAddress(
      coords.latitude,
      coords.longitude
    );

    if (nextAddress) {
      setLocationText(nextAddress);
    } else {
      setLocationText(
        `Lat ${coords.latitude.toFixed(5)}, Long ${coords.longitude.toFixed(5)}`
      );
    }

    if (shouldSetConfirmed) {
      setComplaintCapturedAt(new Date());
      setConfirmedLocation(true);
    }
  };

  const locateUser = async () => {
    try {
      setIsLocating(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id || !(await isLocationUsageAllowed(user.id))) {
        setComplaintCapturedAt(new Date());
        setIsLocating(false);
        setConfirmedLocation(true);
        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        setComplaintCapturedAt(new Date());
        setIsLocating(false);
        setConfirmedLocation(true);
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const nextRegion = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      };

      if (!isInsideBogoCity(nextRegion.latitude, nextRegion.longitude)) {
        if (!bogoWarningShownRef.current) {
          bogoWarningShownRef.current = true;
          Alert.alert(
            "Outside Bogo City",
            "Your current location is outside Bogo City, Cebu. Complaints can only be filed within Bogo City."
          );
        }
      }

      setSelectedLocation(nextRegion);
      await updateAddressFromCoords(nextRegion, true);
    } catch {
      setComplaintCapturedAt(new Date());
      setConfirmedLocation(true);
    } finally {
      setIsLocating(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      Keyboard.dismiss();

      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Microphone Permission Needed",
          "Please allow microphone access so you can use voice input."
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setVoiceNoteUri(null);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.log("Microphone start error:", error);
      Alert.alert("Microphone Error", "Unable to start voice recording.");
    }
  };

  const stopVoiceRecording = async () => {
    try {
      if (!recording) return;

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setIsRecording(false);

      await recording.stopAndUnloadAsync();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      const audioUri = recording.getURI();
      setRecording(null);

      if (!audioUri) {
        Alert.alert("Recording Error", "No audio was recorded.");
        return;
      }

      setVoiceNoteUri(audioUri);
    } catch (error) {
      console.log("Microphone stop error:", error);
      Alert.alert("Microphone Error", "Unable to stop voice recording.");
    } finally {
      setRecordingSeconds(0);
    }
  };

  const toggleVoiceRecording = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  const handleSendMessage = () => {
    let cleanMessage = message.trim();

    if (chatStep === 2) {
      cleanMessage = sanitizePhilippineMobileInput(cleanMessage);
    }

    if ((!cleanMessage && !voiceNoteUri) || isRecording) return;

    if (chatStep === 2 && !isValidPhilippineMobile(cleanMessage)) {
      Alert.alert("Invalid Contact Number", getContactNumberErrorMessage());
      return;
    }

    const newMessage = {
      text: cleanMessage || "Voice recording attached.",
      voiceUri: voiceNoteUri,
      time: formatTime(new Date()),
    };

    if (chatStep === 0) {
      const titleText = cleanMessage || "Voice Complaint";
      const detectedType = classifyComplaintTitle(titleText);

      setComplaintTitle(titleText);
      setTitleMessage(newMessage);
      setComplaintType(detectedType);
      setIsEmergency(detectedType === "emergency");
      setChatStep(1);
    } else if (chatStep === 1) {
      setComplaintDescription(cleanMessage || "Voice description attached.");
      setDescriptionMessage(newMessage);
      setChatStep(2);
    } else if (chatStep === 2) {
      setContactNumber(cleanMessage || "Voice contact attached.");
      setContactMessage(newMessage);
      setChatStep(3);
    }

    setMessage("");
    setVoiceNoteUri(null);

    setTimeout(() => {
      scrollToBottom(true);
    }, 120);
  };

  const startReviewEdit = (field) => {
    Keyboard.dismiss();
    setReviewEditField(field);

    if (field === "title") {
      setReviewDraft((prev) => ({ ...prev, title: complaintTitle }));
    } else if (field === "description") {
      setReviewDraft((prev) => ({
        ...prev,
        description: complaintDescription,
      }));
    } else if (field === "contact") {
      setReviewDraft((prev) => ({ ...prev, contact: contactNumber }));
    }

    setTimeout(() => {
      scrollToBottom(true);
    }, 120);
  };

  const saveReviewEdit = (field) => {
    if (field === "title") {
      const nextTitle = reviewDraft.title.trim();

      if (!nextTitle) {
        Alert.alert("Title Required", "Complaint title cannot be empty.");
        return;
      }

      const detectedType = classifyComplaintTitle(nextTitle);
      setComplaintTitle(nextTitle);
      setComplaintType(detectedType);
      setIsEmergency(detectedType === "emergency");
    } else if (field === "description") {
      const nextDescription = reviewDraft.description.trim();

      if (!nextDescription) {
        Alert.alert(
          "Description Required",
          "Complaint description cannot be empty."
        );
        return;
      }

      setComplaintDescription(nextDescription);
    } else if (field === "contact") {
      const cleanContact = sanitizePhilippineMobileInput(reviewDraft.contact);

      if (!isValidPhilippineMobile(cleanContact)) {
        Alert.alert("Invalid Contact Number", getContactNumberErrorMessage());
        return;
      }

      setContactNumber(cleanContact);
    }

    setReviewEditField(null);
  };

  const toggleReviewEdit = (field) => {
    if (reviewEditField === field) {
      saveReviewEdit(field);
      return;
    }

    if (reviewEditField) {
      saveReviewEdit(reviewEditField);
    }

    startReviewEdit(field);
  };

  const addPickedPhotoAssets = async (assets = []) => {
    if (!Array.isArray(assets) || assets.length === 0) {
      return;
    }

    if (isPreparingPhotosRef.current) {
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedPhotosRef.current.length;

    if (remainingSlots <= 0) {
      Alert.alert("Photo Limit Reached", `You can only upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const usableAssets = assets.filter(
      (asset) => asset?.uri && !processedPhotoUrisRef.current.has(asset.uri)
    );

    if (usableAssets.length === 0) {
      return;
    }

    if (usableAssets.length > remainingSlots) {
      Alert.alert(
        "Photo Limit",
        `Only ${remainingSlots} more photo${remainingSlots > 1 ? "s" : ""} can be added. The limit is ${MAX_PHOTOS} photos only.`
      );
    }

    isPreparingPhotosRef.current = true;

    if (isMountedRef.current) {
      setIsPreparingPhotos(true);
    }

    try {
      await new Promise((resolve) => {
        InteractionManager.runAfterInteractions(resolve);
      });

      const preparedPhotos = [];

      for (const asset of usableAssets.slice(0, remainingSlots)) {
        processedPhotoUrisRef.current.add(asset.uri);
        const preparedPhoto = await preparePickedPhotoAsset(asset);

        if (preparedPhoto) {
          preparedPhotos.push(preparedPhoto);
        }
      }

      if (preparedPhotos.length === 0) {
        Alert.alert(
          "Photo Not Added",
          "The selected photo could not be loaded. Please choose another photo from your gallery."
        );
        return;
      }

      setSelectedPhotos((prevPhotos) =>
        [...prevPhotos, ...preparedPhotos].slice(0, MAX_PHOTOS)
      );

      setTimeout(() => {
        scrollToBottom(true);
      }, 120);
    } finally {
      isPreparingPhotosRef.current = false;

      if (isMountedRef.current) {
        setIsPreparingPhotos(false);
      }
    }
  };

  const pickPhotos = async () => {
    if (selectedPhotosRef.current.length >= MAX_PHOTOS) {
      Alert.alert("Photo Limit Reached", `You can only upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    if (isPreparingPhotosRef.current) {
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission Needed",
          "Please allow photo access so you can upload evidence."
        );
        return;
      }

      const remainingSlots = MAX_PHOTOS - selectedPhotosRef.current.length;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: remainingSlots > 1,
        selectionLimit: remainingSlots,
        quality: 0.8,
        base64: false,
        exif: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      await addPickedPhotoAssets(result.assets);
    } catch (error) {
      console.log("Image picker error:", error);
      Alert.alert(
        "Photo Error",
        "The app could not open or load the selected photo. Please try choosing another photo."
      );
    }
  };

  useEffect(() => {
    const restorePendingImagePickerResult = async () => {
      if (isPreparingPhotosRef.current) {
        return;
      }

      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();

        if (
          !pendingResult ||
          pendingResult.canceled ||
          !pendingResult.assets ||
          pendingResult.assets.length === 0
        ) {
          return;
        }

        const freshAssets = pendingResult.assets.filter(
          (asset) => asset?.uri && !processedPhotoUrisRef.current.has(asset.uri)
        );

        if (freshAssets.length === 0) {
          return;
        }

        await addPickedPhotoAssets(freshAssets);
      } catch (error) {
        console.log("Pending image picker error:", error);
      }
    };

    restorePendingImagePickerResult();

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        restorePendingImagePickerResult();
      }
    });

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const removePhoto = (photoId) => {
    setSelectedPhotos((prevPhotos) =>
      prevPhotos.filter((photo) => photo.id !== photoId)
    );
  };

  const uploadComplaintPhotos = async (complaintId) => {
    const uploadedPhotoPaths = [];

    for (let index = 0; index < selectedPhotos.length; index += 1) {
      const photo = selectedPhotos[index];
      let preparedPhoto = null;

      try {
        preparedPhoto = await readPhotoForUpload(photo);
        const filePath = `${complaintId}/photo-${
          index + 1
        }-${Date.now()}.${preparedPhoto.extension}`;

        const { error: uploadError } = await supabase.storage
          .from("complaint-photos")
          .upload(filePath, preparedPhoto.arrayBuffer, {
            contentType: preparedPhoto.contentType,
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        uploadedPhotoPaths.push(filePath);
      } finally {
        if (preparedPhoto) {
          preparedPhoto.arrayBuffer = null;
        }
      }
    }

    return uploadedPhotoPaths;
  };

  const navigateToComplaintDetails = (complaintId) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        router.replace({
          pathname: "/citizen/complaints",
          params: {
            complaintId,
            openDetails: "true",
          },
        });
      });
    });
  };

  const confirmDuplicateSubmission = (message) =>
    new Promise((resolve) => {
      Alert.alert(
        "Similar Report Found",
        message,
        [
          { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
          { text: "Submit Anyway", onPress: () => resolve(true) },
        ],
        { cancelable: false }
      );
    });

  const navigateToAnalysisResult = ({
    complaintId,
    analysis,
    photoUploadFailed,
  }) => {
    const firstPhotoUri = selectedPhotos[0]?.uri || "";
    const duplicateStatus = shouldWarnAboutDuplicate(analysis)
      ? "duplicate"
      : "clear";

    router.replace({
      pathname: "/citizen/aiAnalysisResult",
      params: {
        complaintId: String(complaintId),
        photoUri: firstPhotoUri,
        complaintTitle: complaintTitle.trim(),
        complaintDescription: complaintDescription.trim(),
        submittedDateTime: `${formatDateTime(new Date())} ${formatTime(new Date())}`,
        locationText,
        complaintType: analysis.complaint_type || (analysis.is_emergency ? "Emergency" : "Non-Emergency"),
        isEmergency: analysis.is_emergency ? "true" : "false",
        category: analysis.category,
        assignedOffice: analysis.assignedOffice,
        priority: analysis.priority,
        urgencyReason: analysis.urgency_analysis?.urgency_reason || analysis.reasoning || "",
        severityScore: String(analysis.urgency_analysis?.severity_score ?? ""),
        clusterStatus: analysis.cluster?.is_cluster ? "cluster" : "none",
        clusterSummary: analysis.cluster?.summary || analysis.cluster_analysis?.priority_impact || "",
        nearbyReportCount: String(analysis.cluster?.similar_category_count ?? 0),
        duplicateStatus,
        duplicateReason: analysis.duplicate?.reason || "",
        imageRelevance:
          analysis.image_analysis?.is_relevant === true
            ? "relevant"
            : analysis.image_analysis?.is_relevant === false
              ? "not_relevant"
              : "unknown",
        imageSummary: analysis.image_analysis?.summary || "",
        detectedSubject: analysis.image_analysis?.detected_subject || "",
        mismatchReason: analysis.image_analysis?.mismatch_reason || "",
        aiReasoning: analysis.reasoning || "",
        aiSource: analysis.source || "gemini",
        photoUploadFailed: photoUploadFailed ? "true" : "false",
      },
    });
  };

  const handleSubmitComplaint = async () => {
    if (isSubmitting || isSubmittingRef.current || isAnalyzing) return;

    if (!complaintTitle || !complaintDescription || !contactNumber) {
      Alert.alert(
        "Incomplete Complaint",
        "Please complete the complaint title, description, and contact number."
      );
      return;
    }

    const cleanContactNumber = sanitizePhilippineMobileInput(contactNumber);

    if (!isValidPhilippineMobile(cleanContactNumber)) {
      Alert.alert("Invalid Contact Number", getContactNumberErrorMessage());
      return;
    }

    if (!confirmedLocation) {
      Alert.alert(
        "Location Required",
        "Please confirm or edit your complaint location before submitting."
      );
      return;
    }

    if (selectedPhotos.length === 0) {
      Alert.alert(
        "Photo Required",
        "Please upload at least one photo evidence before submitting."
      );
      return;
    }

    Keyboard.dismiss();

    if (isRecording && recording) {
      try {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        setIsRecording(false);
        await recording.stopAndUnloadAsync();
        setRecording(null);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch (recordingError) {
        console.log("Stop recording before submit error:", recordingError);
      }
    }

    isSubmittingRef.current = true;

    if (isMountedRef.current) {
      setIsSubmitting(true);
      setIsAnalyzing(true);
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert(
          "Login Required",
          "Please log in again before submitting a complaint."
        );
        return;
      }

      const analysis = await analyzeComplaint({
        title: complaintTitle.trim(),
        description: complaintDescription.trim(),
        locationText,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        isEmergency: complaintType === "emergency",
        photoUris: selectedPhotos.map((photo) => photo.uri).filter(Boolean),
        userId: user.id,
      });

      if (isComplaintAnalysisRejected(analysis)) {
        Alert.alert(
          "Complaint Not Accepted",
          getComplaintRejectionMessage(analysis)
        );
        return;
      }

      let submittedDespiteDuplicate = false;

      if (shouldWarnAboutDuplicate(analysis)) {
        const shouldContinue = await confirmDuplicateSubmission(
          getDuplicateWarningMessage(analysis)
        );

        if (!shouldContinue) {
          return;
        }

        submittedDespiteDuplicate = true;
      }

      const detectedCategory = analysis.category;
      const assignedOffice = analysis.assignedOffice;
      const defaultStatus = "Pending";
      const resolvedEmergency = Boolean(analysis.is_emergency);
      const finalComplaintType =
        analysis.complaint_type ||
        (resolvedEmergency ? "Emergency" : "Non-Emergency");
      const defaultPriority =
        analysis.priority ||
        (resolvedEmergency ? "Critical" : "Normal");

      const submitStamp = new Date();
      const finalSubmittedDateTime = `${formatDateTime(submitStamp)} ${formatTime(
        submitStamp
      )}`;

      const complaintPayload = {
        citizen_id: user.id,
        title: complaintTitle.trim(),
        description: complaintDescription.trim(),
        contact_number: cleanContactNumber,
        complaint_type: finalComplaintType,
        is_emergency: resolvedEmergency,
        status: defaultStatus,
        priority: defaultPriority,
        category: detectedCategory,
        assigned_office: assignedOffice,
        location_text: locationText,
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        submitted_date_time: finalSubmittedDateTime,
        photo_urls: [],
        created_at: new Date().toISOString(),
      };

      const { data: insertedComplaint, error: insertError } = await supabase
        .from("complaints")
        .insert(complaintPayload)
        .select()
        .single();

      if (insertError) {
        Alert.alert("Submit Failed", insertError.message);
        return;
      }

      let photoPaths = [];
      let photoUploadFailed = false;

      try {
        photoPaths = await uploadComplaintPhotos(insertedComplaint.id);
      } catch (photoError) {
        photoUploadFailed = true;
        console.log("Photo upload error:", photoError);
      }

      if (photoPaths.length > 0) {
        const { error: photoUpdateError } = await supabase
          .from("complaints")
          .update({ photo_urls: photoPaths })
          .eq("id", insertedComplaint.id);

        if (photoUpdateError) {
          console.log("Photo path update error:", photoUpdateError);
        }
      }

      const citizenName = await getProfileDisplayName(user.id);

      await notifyDepartmentHeadsNewAssignment({
        complaint: insertedComplaint,
        department: assignedOffice,
      });

      await notifyAdminsNewComplaint({
        complaint: insertedComplaint,
        citizenName,
      });

      if (submittedDespiteDuplicate) {
        await notifyCitizenDuplicateSubmission({
          citizenId: user.id,
          complaintId: insertedComplaint.id,
          shortId: insertedComplaint.id,
          duplicateReason: analysis.duplicate?.reason,
          similarComplaintId: analysis.duplicate?.similar_complaint_id,
        });
      }

      navigateToAnalysisResult({
        complaintId: insertedComplaint.id,
        analysis,
        photoUploadFailed,
      });
    } catch (error) {
      console.log("Submit complaint error:", error);
      Alert.alert(
        "Submit Failed",
        "Something went wrong while submitting your complaint. Please try again."
      );
    } finally {
      isSubmittingRef.current = false;

      if (isMountedRef.current) {
        setIsSubmitting(false);
        setIsAnalyzing(false);
      }
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  const renderUserMessage = (item) => {
    if (!item) return null;

    return (
      <View style={styles.userBubbleWrapper}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{item.text}</Text>

          {item.voiceUri && (
            <View style={styles.voiceBubbleTag}>
              <Ionicons name="mic" size={11} color={GREEN} />
              <Text style={styles.voiceBubbleText}>Voice attached</Text>
            </View>
          )}

          <Text style={styles.userTime}>{item.time}</Text>
        </View>
      </View>
    );
  };

  const renderBogoBoundaryWarning = () => {
    if (!isOutsideBogoCity || isLocating) {
      return null;
    }

    return (
      <View style={styles.bogoWarningBox}>
        <Ionicons name="warning" size={18} color={RED} />
        <Text style={styles.bogoWarningText}>
          You are outside Bogo City, Cebu. Complaints can only be filed within
          the city boundary.
        </Text>
      </View>
    );
  };

  const renderLocationPreview = () => {
    return (
      <View style={styles.reviewMapBox}>
        <ComplaintMapView
          latitude={selectedLocation.latitude}
          longitude={selectedLocation.longitude}
          style={styles.reviewMap}
        />

        {isLocating && (
          <View style={styles.mapPreviewLoading}>
            <ActivityIndicator size="small" color={GREEN} />
            <Text style={styles.mapPreviewLoadingText}>Capturing location...</Text>
          </View>
        )}
      </View>
    );
  };

  const renderReviewEditableField = (
    field,
    label,
    value,
    { multiline = false, keyboardType = "default", maxLength } = {}
  ) => {
    const isEditing = reviewEditField === field;

    return (
      <View style={styles.reviewItem}>
        <View style={styles.reviewTextBox}>
          <Text style={styles.reviewLabel}>{label}</Text>

          {isEditing ? (
            <TextInput
              style={[
                styles.reviewInput,
                multiline && styles.reviewInputMultiline,
              ]}
              value={reviewDraft[field]}
              onChangeText={(text) =>
                setReviewDraft((prev) => ({
                  ...prev,
                  [field]:
                    field === "contact"
                      ? sanitizePhilippineMobileInput(text)
                      : text,
                }))
              }
              multiline={multiline}
              keyboardType={keyboardType}
              maxLength={maxLength}
              autoFocus
              onFocus={() => scrollToBottom(true)}
            />
          ) : (
            <Text style={styles.reviewValue}>{value}</Text>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleReviewEdit(field)}
        >
          <Feather
            name={isEditing ? "check" : "edit-2"}
            size={15}
            color={GREEN}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmergencyHotline = (hotline) => (
    <TouchableOpacity
      key={hotline.title}
      activeOpacity={0.7}
      style={styles.hotlineCard}
      onPress={() => dialHotline(hotline.number)}
    >
      <View style={styles.hotlineIconCircle}>
        {hotline.iconSet === "fa5" ? (
          <FontAwesome5 name={hotline.icon} size={15} color={RED} />
        ) : (
          <Ionicons name={hotline.icon} size={18} color={RED} />
        )}
      </View>

      <View style={styles.hotlineTextBox}>
        <Text style={styles.hotlineTitle}>{hotline.title}</Text>
        <Text style={styles.hotlineSubtitle}>{hotline.number}</Text>
      </View>

      <Feather name="chevron-right" size={20} color={TEXT} />
    </TouchableOpacity>
  );

  const renderBotMessage = (text, time = formatTime(new Date())) => (
    <View style={styles.chatRow}>
      <View style={styles.smallBotAvatar}>
        <Image source={BOT_LOGO} style={styles.smallBotLogo} />
      </View>

      <View style={styles.botBubble}>
        <Text style={styles.botText}>{text}</Text>
        <Text style={styles.messageTime}>{time}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View style={styles.mainContainer}>
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Feather name="chevron-left" size={26} color={TEXT} />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Submit Complaint</Text>
            <Text style={styles.headerDescription}>
              Report an emergency or city concern through CitiSense.
            </Text>
          </View>
        </View>

        <View style={styles.assistantHeader}>
          <View style={styles.assistantAvatar}>
            <Image source={BOT_LOGO} style={styles.assistantBotLogo} />
          </View>

          <View style={styles.assistantTextBox}>
            <Text style={styles.assistantTitle}>CitiSense Assistant</Text>
            <Text style={styles.assistantSubtitle}>AI-guided complaint form</Text>
          </View>
        </View>

        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          scrollEventThrottle={16}
          overScrollMode="never"
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPadding },
          ]}
          onContentSizeChange={() => {
            scrollToBottom(false);
          }}
        >
          <View style={styles.chatDatePill}>
            <Text style={styles.chatDateText}>{formattedDate}</Text>
          </View>

          {renderBotMessage(
            "Hello! I'm CitiSense Assistant. I'm here to help you submit your complaint.",
            formatTime(screenStartTime)
          )}

          {renderUserMessage(titleMessage)}

          {chatStep >= 1 && complaintType === "emergency" && (
            <>
              <View style={styles.emergencyCard}>
                <View style={styles.emergencyIconBox}>
                  <Ionicons name="warning" size={30} color={WHITE} />
                </View>

                <View style={styles.emergencyTextBox}>
                  <Text style={styles.emergencyTitle}>
                    Life-Threatening Emergency Detected
                  </Text>
                  <Text style={styles.emergencySubtitle}>
                    Act now. Every second counts.
                  </Text>
                </View>
              </View>

              {emergencyHotlines.map(renderEmergencyHotline)}
            </>
          )}

          {chatStep >= 1 &&
            renderBotMessage(
              "Please describe your concern in detail.",
              formatTime(new Date())
            )}

          {renderUserMessage(descriptionMessage)}

          {chatStep >= 2 &&
            renderBotMessage(
              "May I have your contact number so we can reach you for updates?",
              formatTime(new Date())
            )}

          {renderUserMessage(contactMessage)}

          {chatStep >= 3 &&
            renderBotMessage(
              "Kindly upload a photo as evidence.",
              formatTime(new Date())
            )}

          {chatStep >= 3 && (
            <View style={styles.uploadCard}>
              <View style={styles.uploadInner}>
                <View style={styles.uploadIconCircle}>
                  <Ionicons name="camera" size={38} color={GREEN} />
                </View>

                <Text style={styles.uploadTitle}>Upload Photo</Text>

                <Text style={styles.uploadDescription}>
                  Show the area or problem clearly in the photo.
                </Text>

                {selectedPhotos.length > 0 && (
                  <View style={styles.selectedPhotosSection}>
                    <Text style={styles.selectedCountText}>
                      {selectedPhotos.length}/{MAX_PHOTOS} photo
                      {selectedPhotos.length !== 1 ? "s" : ""} selected
                    </Text>

                    <View style={styles.photoPreviewRow}>
                      {selectedPhotos.map((photo) => (
                        <View key={photo.id} style={styles.photoPreviewBox}>
                          <ExpoImage
                            source={{ uri: photo.uri }}
                            style={styles.photoPreview}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={photo.id}
                          />

                          <TouchableOpacity
                            style={styles.removePhotoButton}
                            activeOpacity={0.8}
                            onPress={() => removePhoto(photo.id)}
                          >
                            <Ionicons name="close" size={13} color={WHITE} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {selectedPhotos.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={[
                      styles.chooseButton,
                      isPreparingPhotos && styles.chooseButtonDisabled,
                    ]}
                    onPress={pickPhotos}
                    disabled={isPreparingPhotos}
                  >
                    {isPreparingPhotos ? (
                      <View style={styles.preparingPhotoRow}>
                        <ActivityIndicator size="small" color={WHITE} />
                        <Text style={styles.chooseButtonText}>Preparing photo...</Text>
                      </View>
                    ) : (
                      <Text style={styles.chooseButtonText}>
                        {selectedPhotos.length === 0
                          ? "Choose Photo"
                          : "Add More Photos"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}

                <Text style={styles.uploadFormats}>
                  You can upload up to {MAX_PHOTOS} photos.{"\n\n"}
                  Accepted Format: JPG, JPEG, PNG, HEIC, HEIF{"\n"}
                  Max size: 10MB per photo
                </Text>
              </View>
            </View>
          )}

          {hasSelectedPhotos &&
            renderBotMessage(
              "Please review your complaint details before submitting.",
              formatTime(new Date())
            )}

          {hasSelectedPhotos && (
            <View style={styles.reviewCard}>
              {renderReviewEditableField(
                "title",
                "Complaint Title",
                complaintTitle
              )}

              <View style={styles.reviewItem}>
                <View style={styles.reviewTextBox}>
                  <Text style={styles.reviewLabel}>Complaint Type</Text>
                  <Text style={styles.reviewValue}>
                    {complaintType === "emergency"
                      ? "Emergency"
                      : "Non-Emergency"}
                  </Text>
                </View>
              </View>

              {renderReviewEditableField(
                "description",
                "Description",
                complaintDescription,
                { multiline: true }
              )}

              {renderReviewEditableField(
                "contact",
                "Contact Number",
                contactNumber,
                { keyboardType: "phone-pad", maxLength: 11 }
              )}

              <View style={styles.reviewItem}>
                <View style={styles.reviewTextBox}>
                  <Text style={styles.reviewLabel}>Photo Evidence</Text>

                  <View style={styles.reviewPhotoRow}>
                    {selectedPhotos.map((photo) => (
                      <View key={photo.id} style={styles.reviewPhotoWrapper}>
                        <ExpoImage
                          source={{ uri: photo.uri }}
                          style={styles.reviewPhoto}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={photo.id}
                        />

                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={styles.reviewPhotoRemoveButton}
                          onPress={() => removePhoto(photo.id)}
                        >
                          <Ionicons name="close" size={12} color={WHITE} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  {selectedPhotos.length < MAX_PHOTOS && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.reviewAddPhotoButton}
                      onPress={pickPhotos}
                      disabled={isPreparingPhotos}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={GREEN} />
                      <Text style={styles.reviewAddPhotoText}>
                        Add photo ({selectedPhotos.length}/{MAX_PHOTOS})
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity activeOpacity={0.7} onPress={pickPhotos}>
                  <Feather name="edit-2" size={15} color={GREEN} />
                </TouchableOpacity>
              </View>

              <View style={styles.reviewItemNoEdit}>
                <Text style={styles.reviewLabel}>Date & Time</Text>
                <Text style={styles.reviewValue}>{submittedDateTime}</Text>
              </View>

              <View style={styles.reviewLocationSection}>
                <View style={styles.reviewItemNoEdit}>
                  <Text style={styles.reviewLabel}>Location</Text>
                  <Text style={styles.reviewValue}>{locationText}</Text>
                </View>

                {renderBogoBoundaryWarning()}

                {renderLocationPreview()}

                <Text style={styles.reviewCoordinates}>
                  Latitude: {selectedLocation.latitude.toFixed(6)} • Longitude:{" "}
                  {selectedLocation.longitude.toFixed(6)}
                </Text>
              </View>
            </View>
          )}

          {hasSelectedPhotos &&
            renderBotMessage(
              "If everything looks correct, tap Submit Complaint.",
              formatTime(new Date())
            )}

          {hasSelectedPhotos && (
            <TouchableOpacity
              activeOpacity={0.75}
              style={[
                styles.inlineSubmitButton,
                (isSubmitting || isAnalyzing) && styles.inlineSubmitButtonDisabled,
              ]}
              onPress={handleSubmitComplaint}
              disabled={isSubmitting || isAnalyzing}
            >
              {isSubmitting || isAnalyzing ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <Ionicons name="send" size={24} color={WHITE} />
              )}

              <Text style={styles.inlineSubmitButtonText}>
                {isAnalyzing
                  ? "ANALYZING..."
                  : isSubmitting
                    ? "SUBMITTING..."
                    : "SUBMIT COMPLAINT"}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {isKeyboardOpen && shouldShowInput && (
          <View
            style={[
              styles.keyboardWhiteCover,
              { height: keyboardOffset + MESSAGE_INPUT_HEIGHT + 8 },
            ]}
          />
        )}

        {shouldShowInput && (
          <View style={[styles.messageInputWrapper, { bottom: inputBottom }]}>
            {isRecording && (
              <View style={styles.recordingBanner}>
                <View style={styles.recordingDot} />

                <Text style={styles.recordingText}>
                  Microphone is on • {formatRecordingTime(recordingSeconds)}
                </Text>

                <Text style={styles.recordingHint}>Tap mic again to stop</Text>
              </View>
            )}

            {voiceNoteUri && !isRecording && (
              <View style={styles.voiceReadyBanner}>
                <Ionicons name="mic" size={13} color={GREEN} />
                <Text style={styles.voiceReadyText}>
                  Voice recording attached
                </Text>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setVoiceNoteUri(null)}
                >
                  <Ionicons name="close" size={15} color={RED} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.messageRow}>
              <View
                style={[
                  styles.inputBox,
                  isRecording && styles.inputBoxRecording,
                ]}
              >
                <TextInput
                  key={
                    chatStep === 2
                      ? "contact-number-input"
                      : `message-input-${chatStep}`
                  }
                  ref={textInputRef}
                  style={styles.textInput}
                  value={message}
                  onChangeText={(text) => {
                    const nextText =
                      chatStep === 2
                        ? sanitizePhilippineMobileInput(text)
                        : text;

                    setMessage(nextText);
                    scrollToBottom(false);
                  }}
                  onFocus={() => scrollToBottom(true)}
                  placeholder={
                    isRecording
                      ? "Listening..."
                      : voiceNoteUri
                      ? "Add text or send voice..."
                      : chatStep === 0
                      ? "Type your complaint title..."
                      : chatStep === 1
                      ? "Describe what happened..."
                      : "09XXXXXXXXX"
                  }
                  placeholderTextColor="#9A9A9A"
                  returnKeyType="send"
                  onSubmitEditing={handleSendMessage}
                  blurOnSubmit={false}
                  editable={!isRecording}
                  keyboardType={chatStep === 2 ? "phone-pad" : "default"}
                  inputMode={chatStep === 2 ? "tel" : "text"}
                  textContentType={
                    chatStep === 2 ? "telephoneNumber" : "none"
                  }
                  maxLength={chatStep === 2 ? 11 : undefined}
                />

                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[
                    styles.micButton,
                    isRecording && styles.micButtonActive,
                  ]}
                  onPress={toggleVoiceRecording}
                >
                  <Ionicons
                    name={isRecording ? "mic" : "mic-outline"}
                    size={19}
                    color={isRecording ? WHITE : "#777777"}
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.sendButton,
                  {
                    opacity:
                      (message.trim().length > 0 || voiceNoteUri) &&
                      !isRecording
                        ? 1
                        : 0.5,
                  },
                ]}
                activeOpacity={0.7}
                onPress={handleSendMessage}
                disabled={
                  (message.trim().length === 0 && !voiceNoteUri) || isRecording
                }
              >
                <Ionicons name="send" size={23} color={WHITE} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!isKeyboardOpen && (
          <View style={styles.bottomNav}>
            {bottomTabs.map((tab) => {
              const isActive =
                pathname?.includes(tab.activePath) ||
                (tab.label === "Submit" && pathname?.includes("citizenSubmit"));

              return (
                <TouchableOpacity
                  key={tab.label}
                  style={[styles.navItem, { flex: tab.flex }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (isActive) return;
                    router.replace(tab.route);
                  }}
                >
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={26}
                    color={isActive ? GREEN : "#000000"}
                  />

                  <Text
                    style={[
                      styles.navLabel,
                      {
                        color: isActive ? GREEN : "#000000",
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
        )}

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
    paddingTop: HEADER_TOP_SPACING,
    paddingBottom: 8,
  },

  backButton: {
    width: 34,
    height: 34,
    alignItems: "flex-start",
    justifyContent: "center",
    marginRight: 6,
  },

  headerTitleBox: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 20,
    color: "#15651E",
    lineHeight: 24,
  },

  headerDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: MUTED,
    marginTop: 1,
    lineHeight: 14,
  },

  assistantHeader: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EDE1",
    backgroundColor: WHITE,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    zIndex: 5,
  },

  assistantAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: "#B4E37C",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
    marginRight: 10,
    overflow: "hidden",
  },

  assistantBotLogo: {
    width: 30,
    height: 30,
    resizeMode: "contain",
  },

  assistantTextBox: {
    flex: 1,
  },

  assistantTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15.8,
    color: TEXT,
  },

  assistantSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: MUTED,
    marginTop: -2,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
  },

  chatDatePill: {
    alignSelf: "center",
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "#E8F2E4",
    marginBottom: 14,
  },

  chatDateText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: MUTED,
    letterSpacing: 0.4,
  },

  chatRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
  },

  smallBotAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#B4E37C",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
    marginBottom: 4,
    backgroundColor: WHITE,
    overflow: "hidden",
  },

  smallBotLogo: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },

  botBubble: {
    maxWidth: SCREEN_WIDTH * 0.72,
    minWidth: 185,
    backgroundColor: WHITE,
    borderRadius: 15,
    borderTopLeftRadius: 5,
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 9,
    borderWidth: 1,
    borderColor: "#EEF0EE",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  botText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13.3,
    color: "#222222",
    lineHeight: 20,
    flexShrink: 1,
  },

  messageTime: {
    alignSelf: "flex-end",
    fontFamily: "Poppins_400Regular",
    fontSize: 8,
    color: "#555555",
    marginTop: 5,
  },

  userBubbleWrapper: {
    width: "100%",
    alignItems: "flex-end",
    marginBottom: 16,
  },

  userBubble: {
    maxWidth: SCREEN_WIDTH * 0.72,
    minWidth: 96,
    backgroundColor: SOFT_GREEN,
    borderRadius: 15,
    borderTopRightRadius: 5,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 9,
    alignItems: "flex-end",
    borderWidth: 1,
    borderColor: "#D9EFD1",
  },

  userText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 13.3,
    color: "#222222",
    lineHeight: 20,
    textAlign: "right",
    alignSelf: "stretch",
    flexShrink: 1,
  },

  userTime: {
    alignSelf: "flex-end",
    fontFamily: "Poppins_400Regular",
    fontSize: 8,
    color: "#555555",
    marginTop: 5,
  },

  voiceBubbleTag: {
    marginTop: 6,
    alignSelf: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F5FBF2",
    flexDirection: "row",
    alignItems: "center",
  },

  voiceBubbleText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 9,
    color: GREEN,
    marginLeft: 4,
  },

  emergencyCard: {
    minHeight: 76,
    borderRadius: 13,
    borderWidth: 1.2,
    borderColor: RED,
    backgroundColor: "#FFF4F4",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 10,
  },

  emergencyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
  },

  emergencyTextBox: {
    flex: 1,
  },

  emergencyTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13.6,
    color: DARK_RED,
  },

  emergencySubtitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: DARK_RED,
    marginTop: 3,
  },

  hotlineCard: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0B3B7",
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginBottom: 9,
  },

  hotlineIconCircle: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: "#FFEDEF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },

  hotlineTextBox: {
    flex: 1,
  },

  hotlineTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13.2,
    color: "#222222",
  },

  hotlineSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "#222222",
    marginTop: -1,
  },

  uploadCard: {
    width: "100%",
    minHeight: 335,
    borderWidth: 1.2,
    borderColor: "#D7DED5",
    borderStyle: "dashed",
    borderRadius: 26,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
    marginBottom: 18,
  },

  uploadInner: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  uploadIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EEF8EE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },

  uploadTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: TEXT,
  },

  uploadDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "#222222",
    textAlign: "center",
    lineHeight: 17,
    marginTop: 7,
    marginBottom: 18,
  },

  selectedPhotosSection: {
    width: "100%",
    alignItems: "center",
    marginBottom: 16,
  },

  selectedCountText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: GREEN,
    marginBottom: 10,
  },

  photoPreviewRow: {
    flexDirection: "row",
    justifyContent: "center",
    columnGap: 9,
  },

  photoPreviewBox: {
    width: 68,
    height: 68,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#EEF1ED",
  },

  photoPreview: {
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

  chooseButton: {
    minWidth: SCREEN_WIDTH * 0.52,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 13,
  },

  chooseButtonDisabled: {
    opacity: 0.75,
  },

  preparingPhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  chooseButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: WHITE,
  },

  uploadFormats: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10,
    color: "#222222",
    textAlign: "center",
    lineHeight: 15,
  },

  reviewCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 18,
    paddingVertical: 17,
    marginBottom: 18,
  },

  reviewItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },

  reviewItemNoEdit: {
    marginBottom: 14,
  },

  reviewTextBox: {
    flex: 1,
    paddingRight: 12,
  },

  reviewLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: GREEN,
    marginBottom: 3,
  },

  reviewValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 17,
  },

  reviewInput: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 17,
    borderWidth: 1,
    borderColor: "#CFE8C8",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FAFDF9",
    minHeight: 38,
  },

  reviewInputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },

  reviewAddPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    marginTop: 8,
  },

  reviewAddPhotoText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: GREEN,
  },

  reviewPhotoRow: {
    flexDirection: "row",
    columnGap: 8,
    marginTop: 5,
    flexWrap: "wrap",
    rowGap: 8,
  },

  reviewPhotoWrapper: {
    width: 72,
    height: 48,
    borderRadius: 4,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#E8E8E8",
  },

  reviewPhoto: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  reviewPhotoRemoveButton: {
    position: "absolute",
    top: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(215, 25, 32, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },

  reviewMapBox: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "#E8E8E8",
    position: "relative",
  },

  reviewLocationSection: {
    marginBottom: 14,
  },

  reviewMap: {
    width: "100%",
    height: "100%",
  },

  exactAddressBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 8,
    marginBottom: 8,
  },

  exactAddressTextBox: {
    flex: 1,
  },

  exactAddressLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: GREEN,
    marginBottom: 2,
  },

  exactAddressText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: TEXT,
    lineHeight: 18,
  },

  reviewMapFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F3",
  },

  reviewMapFallbackText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: MUTED,
    marginTop: 2,
  },

  mapAddressOverlay: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: "rgba(255, 255, 255, 0.94)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(8, 122, 13, 0.18)",
  },

  mapAddressOverlayText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: TEXT,
    lineHeight: 15,
  },

  mapEditOverlay: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 5,
    backgroundColor: "rgba(8, 122, 13, 0.92)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },

  mapEditOverlayText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10.5,
    color: WHITE,
  },

  mapPreviewLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.72)",
    alignItems: "center",
    justifyContent: "center",
    rowGap: 6,
  },

  mapPreviewLoadingText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: MUTED,
  },

  addressOnlyBox: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 6,
  },

  addressOnlyText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11.5,
    color: TEXT,
    lineHeight: 17,
  },

  locationCard: {
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 14,
  },

  locationCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    marginBottom: 6,
  },

  locationCardTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13.5,
    color: TEXT,
  },

  locationCardAddress: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    lineHeight: 18,
    marginBottom: 4,
  },

  bogoWarningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    columnGap: 8,
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#F5C2C2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },

  bogoWarningText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: DARK_RED,
    lineHeight: 16,
  },

  locationCardCoordinates: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 8,
  },

  locationCapturedTime: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: GREEN,
    marginTop: 6,
  },

  locationEditButton: {
    marginTop: 10,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CFE8C8",
    backgroundColor: SOFT_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
  },

  locationEditButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: GREEN,
  },

  mapLoadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F3",
  },

  mapLoadingText: {
    marginTop: 10,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: MUTED,
  },

  reviewCoordinates: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 6,
  },

  inlineSubmitButton: {
    height: 54,
    borderRadius: 8,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    marginBottom: 18,
  },

  inlineSubmitButtonDisabled: {
    opacity: 0.7,
  },

  inlineSubmitButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: WHITE,
    marginLeft: 10,
    letterSpacing: 0.3,
  },

  keyboardWhiteCover: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WHITE,
    zIndex: 25,
    elevation: 25,
  },

  messageInputWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: 64,
    backgroundColor: "transparent",
    paddingHorizontal: 13,
    zIndex: 40,
    elevation: 40,
  },

  messageRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  inputBox: {
    flex: 1,
    height: 43,
    borderWidth: 1,
    borderColor: "#CFCFCF",
    borderRadius: 23,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
    marginRight: 9,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  inputBoxRecording: {
    borderColor: GREEN,
    backgroundColor: "#F7FFF5",
  },

  textInput: {
    flex: 1,
    height: 43,
    fontFamily: "Poppins_400Regular",
    fontSize: 13.5,
    color: TEXT,
    paddingVertical: 0,
  },

  micButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  micButtonActive: {
    backgroundColor: RED,
  },

  recordingBanner: {
    alignSelf: "flex-start",
    marginBottom: 7,
    marginLeft: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#FFF4F4",
    borderWidth: 1,
    borderColor: "#F2B7B9",
    flexDirection: "row",
    alignItems: "center",
  },

  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: RED,
    marginRight: 7,
  },

  recordingText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10.5,
    color: TEXT,
  },

  recordingHint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 9.2,
    color: MUTED,
    marginLeft: 8,
  },

  voiceReadyBanner: {
    alignSelf: "flex-start",
    marginBottom: 7,
    marginLeft: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: "#F5FBF2",
    borderWidth: 1,
    borderColor: "#CFE8C8",
    flexDirection: "row",
    alignItems: "center",
    columnGap: 7,
  },

  voiceReadyText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 10.5,
    color: GREEN,
  },

  sendButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
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

  modalSafeArea: {
    flex: 1,
    backgroundColor: WHITE,
  },

  mapEditorOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 300,
    elevation: 300,
    backgroundColor: WHITE,
  },

  mapModalHeader: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDE8",
    backgroundColor: WHITE,
  },

  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1F4F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 4,
  },

  modalTitleBox: {
    flex: 1,
    marginTop: 4,
  },

  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: TEXT,
  },

  modalSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: -1,
  },

  myLocationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EAF6E4",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  modalMapWrapper: {
    flex: 1,
  },

  modalMap: {
    flex: 1,
  },

  mapPinWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },

  mapCenterGuide: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 14,
    height: 14,
    marginLeft: -7,
    marginTop: -7,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: WHITE,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },

  mapCenterDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: WHITE,
  },

  modalAttributionBox: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },

  mapAttributionText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 7,
    color: "#333333",
  },

  modalBottomSheet: {
    backgroundColor: WHITE,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },

  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D7D7D7",
    alignSelf: "center",
    marginBottom: 14,
  },

  coordinatesBox: {
    backgroundColor: "#F5FBF2",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },

  coordinatesLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: GREEN,
  },

  coordinatesText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    marginTop: 3,
  },

  modalConfirmButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  modalConfirmText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: WHITE,
    marginLeft: 8,
  },
});
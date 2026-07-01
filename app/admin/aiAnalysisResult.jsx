import {
  Feather,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#666666";
const BORDER = "#E0E0E0";
const ORANGE = "#F4A24C";
const LIGHT_ORANGE = "#FFF2E8";
const RED = "#D71920";
const LIGHT_RED = "#FFF0F0";

const H_PADDING = 20;

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/citizen/dashboard",
    activePath: "citizen/dashboard",
  },
  {
    label: "Submit",
    activeIcon: "add-circle",
    inactiveIcon: "add-circle-outline",
    route: "/citizen/submit",
    activePath: "citizen/submit",
  },
  {
    label: "My Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/citizen/complaints",
    activePath: "citizen/complaints",
  },
  {
    label: "Notifications",
    activeIcon: "notifications",
    inactiveIcon: "notifications-outline",
    route: "/citizen/notification",
    activePath: "citizen/notification",
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/citizen/profile",
    activePath: "citizen/profile",
  },
];

function getParam(value, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

function detectCategory(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();

  if (
    text.includes("streetlight") ||
    text.includes("street light") ||
    text.includes("poste") ||
    text.includes("light")
  ) {
    return {
      category: "Streetlight Concerns",
      office: "City Engineering Office",
      icon: "bulb-outline",
    };
  }

  if (
    text.includes("road") ||
    text.includes("pothole") ||
    text.includes("bridge") ||
    text.includes("sidewalk")
  ) {
    return {
      category: "Road & Infrastructure",
      office: "City Engineering Office",
      icon: "construct-outline",
    };
  }

  if (
    text.includes("garbage") ||
    text.includes("trash") ||
    text.includes("waste") ||
    text.includes("basura")
  ) {
    return {
      category: "Waste & Environmental",
      office: "City Environment Office",
      icon: "trash-outline",
    };
  }

  if (
    text.includes("drainage") ||
    text.includes("flood") ||
    text.includes("baha") ||
    text.includes("canal")
  ) {
    return {
      category: "Drainage & Flooding",
      office: "City Engineering Office",
      icon: "water-outline",
    };
  }

  if (
    text.includes("traffic") ||
    text.includes("vehicle") ||
    text.includes("accident") ||
    text.includes("road safety")
  ) {
    return {
      category: "Traffic & Road Safety",
      office: "Traffic Management Office",
      icon: "car-outline",
    };
  }

  if (
    text.includes("fire") ||
    text.includes("sunog") ||
    text.includes("rescue") ||
    text.includes("emergency") ||
    text.includes("accident") ||
    text.includes("murder") ||
    text.includes("shooting") ||
    text.includes("stabbing")
  ) {
    return {
      category: "Disaster & Emergency",
      office: "CDRRMO / Emergency Response Office",
      icon: "warning-outline",
    };
  }

  return {
    category: "General City Concern",
    office: "City Administrator Office",
    icon: "document-text-outline",
  };
}

function getPriorityLevel(isEmergency, title = "", description = "") {
  if (isEmergency) return "Critical";

  const text = `${title} ${description}`.toLowerCase();

  if (
    text.includes("not working") ||
    text.includes("danger") ||
    text.includes("unsafe") ||
    text.includes("3 days") ||
    text.includes("several days") ||
    text.includes("blocked")
  ) {
    return "High";
  }

  return "Normal";
}

function SmoothTabItem({ tab, isActive, onPress }) {
  const animatedValue = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: isActive ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [animatedValue, isActive]);

  const scale = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  const labelOpacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });

  return (
    <TouchableOpacity
      style={styles.navItem}
      activeOpacity={0.75}
      onPress={onPress}
    >
      <Animated.View
        style={[
          styles.navIconAnimated,
          {
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <Ionicons
          name={isActive ? tab.activeIcon : tab.inactiveIcon}
          size={25}
          color={isActive ? GREEN : "#000000"}
        />
      </Animated.View>

      <Animated.Text
        style={[
          styles.navLabel,
          {
            opacity: labelOpacity,
            color: isActive ? GREEN : "#000000",
            fontFamily: isActive ? "Poppins_600SemiBold" : "Poppins_500Medium",
          },
        ]}
        numberOfLines={1}
      >
        {tab.label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

function Stepper() {
  return (
    <View style={styles.stepperWrapper}>
      <View style={styles.stepRow}>
        <View style={styles.stepItem}>
          <View style={styles.completedCircle}>
            <Feather name="check" size={15} color={WHITE} />
          </View>
          <Text style={styles.activeStepLabel}>Submitted</Text>
        </View>

        <View style={styles.solidLine} />

        <View style={styles.stepItem}>
          <View style={styles.completedCircle}>
            <Feather name="check" size={15} color={WHITE} />
          </View>
          <Text style={styles.activeStepLabel}>AI Analysis</Text>
        </View>

        <View style={styles.solidLine} />

        <View style={styles.stepItem}>
          <View style={styles.completedCircle}>
            <Feather name="check" size={15} color={WHITE} />
          </View>
          <Text style={styles.activeStepLabel}>Routed</Text>
        </View>

        <View style={styles.dashedLine} />

        <View style={styles.stepItem}>
          <View style={styles.pendingCircle}>
            <Text style={styles.pendingNumber}>4</Text>
          </View>
          <Text style={styles.pendingStepLabel}>Tracking</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value, pill, emergency }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLeft}>
        {icon}
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>

      {pill ? (
        <View style={[styles.typePill, emergency && styles.typePillEmergency]}>
          <Text
            style={[
              styles.typePillText,
              emergency && styles.typePillTextEmergency,
            ]}
          >
            {value}
          </Text>
        </View>
      ) : (
        <Text style={styles.summaryValue}>{value}</Text>
      )}
    </View>
  );
}

function RoutingRow({ icon, label, value, greenValue }) {
  return (
    <View style={styles.routingRow}>
      <View style={styles.routingLeft}>
        {icon}
        <Text style={styles.routingLabel}>{label}</Text>
      </View>

      <Text
        style={[styles.routingValue, greenValue && styles.routingValueGreen]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function AIAnalysisResult() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();

  const photoUri = getParam(params.photoUri);
  const complaintTitle = getParam(params.complaintTitle, "Complaint Submitted");
  const complaintDescription = getParam(
    params.complaintDescription,
    "No description provided."
  );
  const submittedDateTime = getParam(params.submittedDateTime, "Just now");
  const locationText = getParam(params.locationText, "Location not available");
  const complaintType = getParam(params.complaintType, "Non-emergency");
  const isEmergency = getParam(params.isEmergency, "false") === "true";

  const detectedRouting = useMemo(
    () => detectCategory(complaintTitle, complaintDescription),
    [complaintTitle, complaintDescription]
  );

  const priorityLevel = useMemo(
    () => getPriorityLevel(isEmergency, complaintTitle, complaintDescription),
    [isEmergency, complaintTitle, complaintDescription]
  );

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

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
          <Text style={styles.title}>AI Analysis Result</Text>
          <Text style={styles.subtitle}>
            We analyzed your complaint and routed it{"\n"}to the proper
            department.
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Stepper />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Complaint Summary</Text>

            <View style={styles.complaintTopRow}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.complaintImage} />
              ) : (
                <View style={styles.noImageBox}>
                  <Ionicons name="image-outline" size={26} color={MUTED} />
                </View>
              )}

              <View style={styles.complaintTextBox}>
                <Text style={styles.complaintTitle}>{complaintTitle}</Text>
                <Text style={styles.complaintDescription}>
                  {complaintDescription}
                </Text>
              </View>
            </View>

            <View style={styles.summaryDetails}>
              <SummaryRow
                icon={
                  <Ionicons name="calendar-outline" size={18} color={GREEN} />
                }
                label="Submitted on"
                value={submittedDateTime}
              />

              <SummaryRow
                icon={
                  <Ionicons name="location-outline" size={18} color={GREEN} />
                }
                label="Location"
                value={locationText}
              />

              <SummaryRow
                icon={
                  <Ionicons name="pricetag-outline" size={17} color={GREEN} />
                }
                label="Complaint Type"
                value={complaintType}
                pill
                emergency={isEmergency}
              />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detected Category & Routing</Text>

            <View style={styles.routingDetails}>
              <RoutingRow
                icon={
                  <Ionicons
                    name={detectedRouting.icon}
                    size={18}
                    color={GREEN}
                  />
                }
                label="Category"
                value={detectedRouting.category}
              />

              <RoutingRow
                icon={<FontAwesome5 name="building" size={16} color={GREEN} />}
                label="Assigned Office"
                value={detectedRouting.office}
              />

              <RoutingRow
                icon={
                  <MaterialCommunityIcons
                    name="badge-check"
                    size={20}
                    color={GREEN}
                  />
                }
                label="Duplicate Check"
                value="No similar active complaint found"
                greenValue
              />

              <RoutingRow
                icon={<Ionicons name="image" size={18} color={GREEN} />}
                label="Image Relevance"
                value="Relevant evidence detected"
                greenValue
              />
            </View>
          </View>

          <View style={styles.priorityCard}>
            <View style={styles.priorityLeft}>
              <Ionicons
                name={isEmergency ? "warning" : "flag"}
                size={22}
                color={isEmergency ? RED : GREEN}
              />

              <View style={styles.priorityTextBox}>
                <Text style={styles.priorityTitle}>Priority Level</Text>
                <Text style={styles.prioritySubtitle}>
                  {isEmergency
                    ? "Emergency complaints are marked critical and should be handled immediately."
                    : "Priority is shown only for non-emergency complaints."}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.priorityPill,
                isEmergency && styles.priorityPillEmergency,
              ]}
            >
              <Text
                style={[
                  styles.priorityPillText,
                  isEmergency && styles.priorityPillTextEmergency,
                ]}
              >
                {priorityLevel}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.trackButton}
            onPress={() => router.push("/citizen/complaints")}
          >
            <Ionicons name="search-outline" size={26} color={WHITE} />
            <Text style={styles.trackButtonText}>Track My Complaint</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.dashboardButton}
            onPress={() => router.replace("/citizen/dashboard")}
          >
            <Text style={styles.dashboardButtonText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomNav}>
          {bottomTabs.map((tab) => {
            const isActive =
              pathname?.includes(tab.activePath) ||
              (tab.label === "Submit" && pathname?.includes("aiAnalysisResult"));

            return (
              <SmoothTabItem
                key={tab.label}
                tab={tab}
                isActive={isActive}
                onPress={() => {
                  if (isActive) return;
                  router.replace(tab.route);
                }}
              />
            );
          })}
        </View>
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
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },

  fixedHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    backgroundColor: BG,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EDE1",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 128,
    paddingBottom: 108,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 25,
    color: "#15651E",
    lineHeight: 31,
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: "#333333",
    lineHeight: 22,
    marginTop: 2,
  },

  stepperWrapper: {
    marginBottom: 28,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
  },

  stepItem: {
    alignItems: "center",
    width: 68,
  },

  completedCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },

  pendingCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EEF2EE",
    borderWidth: 1,
    borderColor: "#C8D0C8",
    alignItems: "center",
    justifyContent: "center",
  },

  pendingNumber: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "#6A756A",
  },

  activeStepLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
    marginTop: 8,
    textAlign: "center",
  },

  pendingStepLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "#333333",
    marginTop: 8,
    textAlign: "center",
  },

  solidLine: {
    width: 56,
    height: 2,
    backgroundColor: GREEN,
    marginTop: 18,
    marginHorizontal: -17,
  },

  dashedLine: {
    width: 56,
    height: 2,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#777777",
    marginTop: 18,
    marginHorizontal: -17,
  },

  card: {
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 17,
    marginBottom: 16,
  },

  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: TEXT,
    marginBottom: 14,
  },

  complaintTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },

  complaintImage: {
    width: 82,
    height: 64,
    borderRadius: 6,
    resizeMode: "cover",
    backgroundColor: "#EDEDED",
    marginRight: 10,
  },

  noImageBox: {
    width: 82,
    height: 64,
    borderRadius: 6,
    backgroundColor: "#EDEDED",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  complaintTextBox: {
    flex: 1,
    paddingTop: 2,
  },

  complaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: TEXT,
    marginBottom: 3,
  },

  complaintDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "#222222",
    lineHeight: 18,
  },

  summaryDetails: {
    rowGap: 13,
  },

  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  summaryLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "#333333",
    marginLeft: 8,
  },

  summaryValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "#333333",
    textAlign: "right",
    maxWidth: SCREEN_WIDTH * 0.46,
  },

  typePill: {
    minWidth: 132,
    height: 22,
    borderRadius: 12,
    backgroundColor: LIGHT_GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  typePillEmergency: {
    backgroundColor: LIGHT_RED,
  },

  typePillText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: GREEN,
  },

  typePillTextEmergency: {
    color: RED,
  },

  routingDetails: {
    rowGap: 20,
    paddingTop: 2,
  },

  routingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  routingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },

  routingLabel: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "#333333",
    marginLeft: 9,
  },

  routingValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: TEXT,
    textAlign: "right",
    maxWidth: SCREEN_WIDTH * 0.45,
  },

  routingValueGreen: {
    fontFamily: "Poppins_400Regular",
    color: GREEN,
    fontSize: 11.5,
  },

  priorityCard: {
    minHeight: 74,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  priorityLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },

  priorityTextBox: {
    marginLeft: 10,
    flex: 1,
  },

  priorityTitle: {
    fontFamily: "Poppins_500Medium",
    fontSize: 13,
    color: TEXT,
    marginBottom: 4,
  },

  prioritySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 17,
  },

  priorityPill: {
    minWidth: 60,
    height: 22,
    borderRadius: 12,
    backgroundColor: LIGHT_ORANGE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    marginTop: 5,
  },

  priorityPillEmergency: {
    backgroundColor: LIGHT_RED,
  },

  priorityPillText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: ORANGE,
  },

  priorityPillTextEmergency: {
    color: RED,
  },

  trackButton: {
    height: 53,
    borderRadius: 8,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },

  trackButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: WHITE,
    marginLeft: 10,
  },

  dashboardButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },

  dashboardButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: GREEN,
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -10 : -6,
    height: Platform.OS === "ios" ? 82 : 74,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: "#E5E5E5",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingTop: 9,
    paddingBottom: Platform.OS === "ios" ? 15 : 8,
  },

  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  navIconAnimated: {
    alignItems: "center",
    justifyContent: "center",
  },

  navLabel: {
    fontSize: 9.5,
    marginTop: 1,
  },
});
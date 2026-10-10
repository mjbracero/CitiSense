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
import { useEffect, useMemo } from "react";
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PageSkeleton } from "../../components/skeletons";
import { getCategoryIcon } from "../../lib/complaintCategories";
import { getPageCache, setPageCache } from "../../lib/pageDataCache";

// ===== [CITIZEN AI RESULT] Constants: colors, layout, cache key =====
const H_PADDING = 20;
const CITIZEN_ANALYSIS_CACHE_KEY = "citizen.aiAnalysisResult";

// ===== [CITIZEN AI RESULT] Bottom tab config =====
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
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/citizen/profile",
    activePath: "citizen/profile",
  },
];

// ===== [CITIZEN AI RESULT] Helper: read first value of a route param =====
function getParam(value, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

// ===== [CITIZEN AI RESULT] Subcomponent: progress stepper (all steps done) =====
function Stepper() {
  const steps = ["Submitted", "AI Analysis", "Routed"];

  return (
    <View style={styles.stepperWrapper}>
      <View style={styles.stepTrackRow}>
        {steps.map((label) => (
          <View key={label} style={styles.stepColumn}>
            <View style={styles.completedCircle}>
              <Feather name="check" size={15} color="rgba(255, 255, 255, 1)" />
            </View>
            <Text style={styles.activeStepLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ===== [CITIZEN AI RESULT] Subcomponent: summary row (value or pill) =====
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

// ===== [CITIZEN AI RESULT] Subcomponent: routing row (green or warning value) =====
function RoutingRow({ icon, label, value, warning }) {
  return (
    <View style={styles.routingRow}>
      <View style={styles.routingLeft}>
        {icon}
        <Text style={styles.routingLabel}>{label}</Text>
      </View>

      <Text
        style={[
          styles.routingValue,
          warning ? styles.routingValueWarning : styles.routingValueGreen,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

// ===== [CITIZEN AI RESULT] Screen component =====
export default function CitizenAIAnalysisResult() {
  // --- [CITIZEN AI RESULT] Route params -> complaint & AI result fields ---
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();

  const photoUri = getParam(params.photoUri);
  const complaintId = getParam(params.complaintId);
  const complaintTitle = getParam(params.complaintTitle, "Complaint Submitted");
  const complaintDescription = getParam(
    params.complaintDescription,
    "No description provided."
  );
  const submittedDateTime = getParam(params.submittedDateTime, "Just now");
  const locationText = getParam(params.locationText, "Location not available");
  const complaintType = getParam(params.complaintType, "Non-Emergency");
  const isEmergency = getParam(params.isEmergency, "false") === "true";
  const category = getParam(params.category, "Unclassified");
  const assignedOffice = getParam(params.assignedOffice, "Unassigned");
  const priorityLevel = getParam(params.priority, isEmergency ? "Critical" : "Normal");
  const duplicateStatus = getParam(params.duplicateStatus, "clear");
  const duplicateReason = getParam(
    params.duplicateReason,
    "No similar active complaint found."
  );
  const imageRelevance = getParam(params.imageRelevance, "unknown");
  const imageSummary = getParam(
    params.imageSummary,
    "Photo evidence was reviewed during AI analysis."
  );
  const detectedSubject = getParam(params.detectedSubject, "");
  const mismatchReason = getParam(params.mismatchReason, "");
  const urgencyReason = getParam(
    params.urgencyReason,
    "Priority was assigned from complaint urgency and severity."
  );
  const clusterStatus = getParam(params.clusterStatus, "none");
  const clusterSummary = getParam(params.clusterSummary, "");
  const nearbyReportCount = getParam(params.nearbyReportCount, "0");

  // --- [CITIZEN AI RESULT] Derived labels: category icon, cluster, duplicate, image ---
  const categoryIcon = useMemo(() => getCategoryIcon(category), [category]);

  const clusterLabel =
    clusterStatus === "cluster"
      ? `${nearbyReportCount} similar nearby report(s) detected`
      : "No complaint cluster detected nearby";

  const duplicateLabel =
    duplicateStatus === "duplicate"
      ? "Possible duplicate detected"
      : "No similar active complaint found";

  const imageLabel =
    imageRelevance === "relevant"
      ? "Relevant evidence detected"
      : imageRelevance === "not_relevant"
        ? "Photo may not match complaint"
        : "No photo evidence attached";

  // --- [CITIZEN AI RESULT] Fonts & page cache ---
  const cachedAnalysis = getPageCache(CITIZEN_ANALYSIS_CACHE_KEY);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    setPageCache(CITIZEN_ANALYSIS_CACHE_KEY, { visited: true });
  }, []);

  // --- [CITIZEN AI RESULT] Render ---
  if (!fontsLoaded && !cachedAnalysis) {
    return <PageSkeleton variant="analysis" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [CITIZEN AI RESULT UI] Fixed header: title */}
        <View style={styles.fixedHeader}>
          <Text style={styles.title}>AI Analysis Result</Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* [CITIZEN AI RESULT UI] Progress stepper */}
          <Stepper />

          {/* [CITIZEN AI RESULT UI] Complaint summary card: photo, title, description */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Complaint Summary</Text>

            <View style={styles.complaintTopRow}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.complaintImage} />
              ) : (
                <View style={styles.noImageBox}>
                  <Ionicons name="image-outline" size={26} color="rgba(102, 102, 102, 1)" />
                </View>
              )}

              <View style={styles.complaintTextBox}>
                <Text style={styles.complaintTitle}>{complaintTitle}</Text>
                <Text style={styles.complaintDescription}>
                  {complaintDescription}
                </Text>
              </View>
            </View>

            {/* [CITIZEN AI RESULT UI] Summary rows: date, location, complaint type */}
            <View style={styles.summaryDetails}>
              <SummaryRow
                icon={
                  <Ionicons name="calendar-outline" size={18} color="rgba(8, 122, 13, 1)" />
                }
                label="Submitted on"
                value={submittedDateTime}
              />
              <SummaryRow
                icon={
                  <Ionicons name="location-outline" size={18} color="rgba(8, 122, 13, 1)" />
                }
                label="Location"
                value={locationText}
              />
              <SummaryRow
                icon={
                  <Ionicons name="pricetag-outline" size={17} color="rgba(8, 122, 13, 1)" />
                }
                label="Complaint Type"
                value={complaintType}
                pill
                emergency={isEmergency}
              />
            </View>
          </View>

          {/* [CITIZEN AI RESULT UI] Detected category & routing card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Detected Category & Routing</Text>

            <View style={styles.routingDetails}>
              <RoutingRow
                icon={
                  <Ionicons name={categoryIcon} size={18} color="rgba(8, 122, 13, 1)" />
                }
                label="Category"
                value={category}
              />
              <RoutingRow
                icon={<FontAwesome5 name="building" size={16} color="rgba(8, 122, 13, 1)" />}
                label="Assigned Office"
                value={assignedOffice}
              />
              <RoutingRow
                icon={
                  <MaterialCommunityIcons
                    name="content-duplicate"
                    size={20}
                    color="rgba(8, 122, 13, 1)"
                  />
                }
                label="Duplicate Check"
                value={duplicateLabel}
                warning={duplicateStatus === "duplicate"}
              />
              <RoutingRow
                icon={<Ionicons name="image" size={18} color="rgba(8, 122, 13, 1)" />}
                label="Image Relevance"
                value={imageLabel}
                warning={imageRelevance === "not_relevant"}
              />
              <RoutingRow
                icon={
                  <MaterialCommunityIcons
                    name="map-marker-radius"
                    size={20}
                    color="rgba(8, 122, 13, 1)"
                  />
                }
                label="Area Cluster"
                value={clusterLabel}
                warning={clusterStatus === "cluster"}
              />
            </View>

            {/* [CITIZEN AI RESULT UI] Photo analysis notes: subject, summary, mismatch */}
            {detectedSubject ? (
              <Text style={styles.imageNote}>
                Photo shows: {detectedSubject}
              </Text>
            ) : null}
            {imageSummary ? (
              <Text style={styles.imageNote}>{imageSummary}</Text>
            ) : null}
            {imageRelevance === "not_relevant" && mismatchReason ? (
              <Text style={styles.mismatchNote}>{mismatchReason}</Text>
            ) : null}
          </View>

          {/* [CITIZEN AI RESULT UI] Priority level card */}
          <View style={styles.priorityCard}>
            <View style={styles.priorityLeft}>
              <Ionicons
                name={isEmergency ? "warning" : "flag"}
                size={22}
                color={isEmergency ? "rgba(215, 25, 32, 1)" : "rgba(8, 122, 13, 1)"}
              />
              <View style={styles.priorityTextBox}>
                <Text style={styles.priorityTitle}>Priority Level</Text>
                <Text style={styles.prioritySubtitle}>
                  {urgencyReason}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.priorityPill,
                (isEmergency || priorityLevel === "Critical") &&
                  styles.priorityPillEmergency,
              ]}
            >
              <Text
                style={[
                  styles.priorityPillText,
                  (isEmergency || priorityLevel === "Critical") &&
                    styles.priorityPillTextEmergency,
                ]}
              >
                {priorityLevel}
              </Text>
            </View>
          </View>

          {/* [CITIZEN AI RESULT UI] Nearby cluster notice */}
          {clusterStatus === "cluster" && clusterSummary ? (
            <View style={styles.clusterCard}>
              <Ionicons name="location" size={20} color="rgba(8, 122, 13, 1)" />
              <Text style={styles.clusterText}>{clusterSummary}</Text>
            </View>
          ) : null}

          {/* [CITIZEN AI RESULT UI] Duplicate warning */}
          {duplicateStatus === "duplicate" ? (
            <View style={styles.warningCard}>
              <Ionicons name="alert-circle" size={20} color="rgba(215, 25, 32, 1)" />
              <Text style={styles.warningText}>{duplicateReason}</Text>
            </View>
          ) : null}

          {/* [CITIZEN AI RESULT UI] Track My Complaint button */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.trackButton}
            onPress={() =>
              router.replace({
                pathname: "/citizen/complaints",
                params: {
                  complaintId,
                  openDetails: "true",
                },
              })
            }
          >
            <Ionicons name="search-outline" size={26} color="rgba(255, 255, 255, 1)" />
            <Text style={styles.trackButtonText}>Track My Complaint</Text>
          </TouchableOpacity>

          {/* [CITIZEN AI RESULT UI] Back to Dashboard button */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.dashboardButton}
            onPress={() => router.replace("/citizen/dashboard")}
          >
            <Text style={styles.dashboardButtonText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

// ===== [CITIZEN AI RESULT] Styles =====
const styles = StyleSheet.create({
  // --- Layout & header ---
  safeArea: { flex: 1, backgroundColor: "rgba(247, 250, 246, 1)" },
  mainContainer: { flex: 1, backgroundColor: "rgba(247, 250, 246, 1)" },
  loader: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 1)",
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
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(229, 237, 225, 1)",
  },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 88,
    paddingBottom: 108,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 25,
    color: "rgba(21, 101, 30, 1)",
    lineHeight: 31,
  },
  // --- Stepper ---
  stepperWrapper: { marginBottom: 28 },
  stepTrackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  stepColumn: {
    flex: 1,
    alignItems: "center",
  },
  completedCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeStepLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 2,
  },
  // --- Cards & complaint summary ---
  card: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(224, 224, 224, 1)",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 17,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
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
    backgroundColor: "rgba(237, 237, 237, 1)",
    marginRight: 10,
  },
  noImageBox: {
    width: 82,
    height: 64,
    borderRadius: 6,
    backgroundColor: "rgba(237, 237, 237, 1)",
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  complaintTextBox: { flex: 1, paddingTop: 2 },
  complaintTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 3,
  },
  complaintDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "rgba(34, 34, 34, 1)",
    lineHeight: 18,
  },
  summaryDetails: { rowGap: 13 },
  // --- Summary & routing rows ---
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  summaryLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "rgba(102, 102, 102, 1)",
    marginLeft: 8,
  },
  summaryValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: "rgba(23, 23, 23, 1)",
    maxWidth: "48%",
    textAlign: "right",
  },
  typePill: {
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typePillEmergency: { backgroundColor: "rgba(255, 240, 240, 1)" },
  typePillText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: "rgba(8, 122, 13, 1)",
  },
  typePillTextEmergency: { color: "rgba(215, 25, 32, 1)" },
  routingDetails: { rowGap: 14 },
  routingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  routingLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  routingLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "rgba(102, 102, 102, 1)",
    marginLeft: 8,
  },
  routingValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    maxWidth: "52%",
    textAlign: "right",
  },
  routingValueGreen: { color: "rgba(8, 122, 13, 1)" },
  routingValueWarning: { color: "rgba(215, 25, 32, 1)" },
  // --- Notes & cluster card ---
  analysisNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(68, 68, 68, 1)",
    lineHeight: 18,
    marginTop: 14,
  },
  imageNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(102, 102, 102, 1)",
    lineHeight: 17,
    marginTop: 8,
  },
  mismatchNote: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11.5,
    color: "rgba(215, 25, 32, 1)",
    lineHeight: 17,
    marginTop: 8,
  },
  clusterCard: {
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(207, 229, 196, 1)",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  clusterText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "rgba(36, 92, 40, 1)",
    lineHeight: 18,
    marginLeft: 10,
    flex: 1,
  },
  sourceNote: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "rgba(136, 136, 136, 1)",
    marginTop: 10,
  },
  // --- Priority card ---
  priorityCard: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(224, 224, 224, 1)",
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priorityLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    paddingRight: 12,
  },
  priorityTextBox: { marginLeft: 10, flex: 1 },
  priorityTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(23, 23, 23, 1)",
  },
  prioritySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(102, 102, 102, 1)",
    lineHeight: 16,
    marginTop: 3,
  },
  priorityPill: {
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  priorityPillEmergency: { backgroundColor: "rgba(255, 240, 240, 1)" },
  priorityPillText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "rgba(8, 122, 13, 1)",
  },
  priorityPillTextEmergency: { color: "rgba(215, 25, 32, 1)" },
  // --- Warning card & action buttons ---
  warningCard: {
    backgroundColor: "rgba(255, 240, 240, 1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(242, 198, 198, 1)",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  warningText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "rgba(138, 28, 28, 1)",
    lineHeight: 18,
    marginLeft: 10,
    flex: 1,
  },
  trackButton: {
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderRadius: 28,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  trackButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 16,
    color: "rgba(255, 255, 255, 1)",
    marginLeft: 10,
  },
  dashboardButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginBottom: 8,
  },
  dashboardButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 14,
    color: "rgba(8, 122, 13, 1)",
  },
  // --- Bottom nav ---
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopWidth: 1,
    borderTopColor: "rgba(229, 231, 229, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  navItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  navLabel: { fontSize: 9.5, marginTop: 2, textAlign: "center" },
});

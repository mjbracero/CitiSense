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
import { useMemo } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCategoryIcon } from "../../lib/complaintCategories";

const GREEN = "#087A0D";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#666666";
const BORDER = "#E0E0E0";
const RED = "#D71920";
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

function Stepper() {
  const steps = ["Submitted", "AI Analysis", "Routed"];

  return (
    <View style={styles.stepperWrapper}>
      <View style={styles.stepTrackRow}>
        {steps.map((label) => (
          <View key={label} style={styles.stepColumn}>
            <View style={styles.completedCircle}>
              <Feather name="check" size={15} color={WHITE} />
            </View>
            <Text style={styles.activeStepLabel}>{label}</Text>
          </View>
        ))}
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

export default function CitizenAIAnalysisResult() {
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
                  <Ionicons name={categoryIcon} size={18} color={GREEN} />
                }
                label="Category"
                value={category}
              />
              <RoutingRow
                icon={<FontAwesome5 name="building" size={16} color={GREEN} />}
                label="Assigned Office"
                value={assignedOffice}
              />
              <RoutingRow
                icon={
                  <MaterialCommunityIcons
                    name="content-duplicate"
                    size={20}
                    color={GREEN}
                  />
                }
                label="Duplicate Check"
                value={duplicateLabel}
                warning={duplicateStatus === "duplicate"}
              />
              <RoutingRow
                icon={<Ionicons name="image" size={18} color={GREEN} />}
                label="Image Relevance"
                value={imageLabel}
                warning={imageRelevance === "not_relevant"}
              />
              <RoutingRow
                icon={
                  <MaterialCommunityIcons
                    name="map-marker-radius"
                    size={20}
                    color={GREEN}
                  />
                }
                label="Area Cluster"
                value={clusterLabel}
                warning={clusterStatus === "cluster"}
              />
            </View>

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

          {clusterStatus === "cluster" && clusterSummary ? (
            <View style={styles.clusterCard}>
              <Ionicons name="location" size={20} color={GREEN} />
              <Text style={styles.clusterText}>{clusterSummary}</Text>
            </View>
          ) : null}

          {duplicateStatus === "duplicate" ? (
            <View style={styles.warningCard}>
              <Ionicons name="alert-circle" size={20} color={RED} />
              <Text style={styles.warningText}>{duplicateReason}</Text>
            </View>
          ) : null}

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
              pathname?.includes("aiAnalysisResult");

            return (
              <TouchableOpacity
                key={tab.label}
                style={styles.navItem}
                activeOpacity={0.75}
                onPress={() => {
                  if (isActive) return;
                  router.replace(tab.route);
                }}
              >
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={25}
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
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: BG },
  mainContainer: { flex: 1, backgroundColor: BG },
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
    paddingTop: 88,
    paddingBottom: 108,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 25,
    color: "#15651E",
    lineHeight: 31,
  },
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
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  activeStepLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 2,
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
  complaintTextBox: { flex: 1, paddingTop: 2 },
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
  summaryDetails: { rowGap: 13 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  summaryLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: MUTED,
    marginLeft: 8,
  },
  summaryValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12.5,
    color: TEXT,
    maxWidth: "48%",
    textAlign: "right",
  },
  typePill: {
    backgroundColor: "#EAF6E4",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  typePillEmergency: { backgroundColor: "#FFF0F0" },
  typePillText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: GREEN,
  },
  typePillTextEmergency: { color: RED },
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
    color: MUTED,
    marginLeft: 8,
  },
  routingValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    maxWidth: "52%",
    textAlign: "right",
  },
  routingValueGreen: { color: GREEN },
  routingValueWarning: { color: RED },
  analysisNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#444444",
    lineHeight: 18,
    marginTop: 14,
  },
  imageNote: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 17,
    marginTop: 8,
  },
  mismatchNote: {
    fontFamily: "Poppins_500Medium",
    fontSize: 11.5,
    color: RED,
    lineHeight: 17,
    marginTop: 8,
  },
  clusterCard: {
    backgroundColor: "#EAF6E4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CFE5C4",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  clusterText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "#245C28",
    lineHeight: 18,
    marginLeft: 10,
    flex: 1,
  },
  sourceNote: {
    fontFamily: "Poppins_500Medium",
    fontSize: 10.5,
    color: "#888888",
    marginTop: 10,
  },
  priorityCard: {
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
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
    color: TEXT,
  },
  prioritySubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: MUTED,
    lineHeight: 16,
    marginTop: 3,
  },
  priorityPill: {
    backgroundColor: "#EAF6E4",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  priorityPillEmergency: { backgroundColor: "#FFF0F0" },
  priorityPillText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
  },
  priorityPillTextEmergency: { color: RED },
  warningCard: {
    backgroundColor: "#FFF0F0",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F2C6C6",
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  warningText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "#8A1C1C",
    lineHeight: 18,
    marginLeft: 10,
    flex: 1,
  },
  trackButton: {
    backgroundColor: GREEN,
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
    color: WHITE,
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
    color: GREEN,
  },
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 78,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: "#E5E7E5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  navItem: { alignItems: "center", justifyContent: "center", flex: 1 },
  navLabel: { fontSize: 9.5, marginTop: 2, textAlign: "center" },
});

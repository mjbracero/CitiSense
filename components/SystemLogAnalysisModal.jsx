import { Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchAuditLogs } from "../lib/auditLogService";
import {
  applyOffsetPagination,
  DASHBOARD_STATS_PAGE_SIZE,
  fetchAllRowsWithOffset,
} from "../lib/complaintPagination";
import { buildSystemLogAnalysis } from "../lib/systemLogAnalytics";
import { supabase } from "../lib/supabase";
import { useHideBottomNav } from "./PersistentBottomNav";

// ===== [SYSTEM LOG MODAL] Helpers: normalize status, map DB row -> complaint =====
function normalizeStatus(value) {
  const clean = String(value || "")
    .trim()
    .toLowerCase();
  if (clean === "completed" || clean === "resolved" || clean === "closed") {
    return "Completed";
  }
  if (clean === "in progress" || clean === "in_progress") return "In Progress";
  if (clean === "for validation" || clean === "validated") {
    return "For Validation";
  }
  if (clean === "returned" || clean === "unsolved") return "Returned";
  if (clean === "pending" || clean === "assigned") return "Pending";
  return value || "Pending";
}

function mapComplaint(row) {
  return {
    id: row.id,
    status: normalizeStatus(row.status),
    category: row.category || row.concern_category || null,
    assignedOffice: row.assigned_office || row.department || null,
    createdAt: row.created_at || row.submitted_at || null,
    aiCategory: row.ai_category || null,
    aiAssignedOffice: row.ai_assigned_office || null,
    aiConfidence: row.ai_confidence ?? null,
    routedAt: row.routed_at || null,
    inProgressAt: row.in_progress_at || null,
    forValidationAt: row.for_validation_at || null,
    completedAt: row.completed_at || null,
    returnedAt: row.returned_at || null,
    citizenValidationAnswer:
      row.citizen_validation_answer || row.validation_answer || null,
    reassignedFromOffice: row.reassigned_from_office || null,
    reassignedToOffice: row.reassigned_to_office || null,
    reassignedAt: row.reassigned_at || null,
  };
}

// ===== [SYSTEM LOG MODAL] Subcomponent: metric box =====
function MetricBox({ label, value }) {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

// ===== [SYSTEM LOG MODAL] Exported analysis modal =====
/**
 * Admin Settings → System Log Analysis
 * Evaluation view for AI accuracy, processing time, and resolution performance.
 */
export default function SystemLogAnalysisModal({ visible, onClose }) {
  // --- [SYSTEM LOG MODAL] State, insets & fonts ---
  const insets = useSafeAreaInsets();
  useHideBottomNav(visible);

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [SYSTEM LOG MODAL] Load complaints + audit logs and build analysis ---
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await fetchAllRowsWithOffset(
        async (offset, pageSize) => {
          const query = applyOffsetPagination(
            supabase
              .from("complaints")
              .select("*", { count: offset === 0 ? "exact" : undefined })
              .order("created_at", { ascending: false }),
            offset,
            pageSize
          );
          return await query;
        },
        DASHBOARD_STATS_PAGE_SIZE
      );

      if (error) {
        console.log("System log analysis load error:", error);
        setAnalysis(buildSystemLogAnalysis({ complaints: [], auditLogs: [] }));
        return;
      }

      let auditLogs = [];
      try {
        const auditResult = await fetchAuditLogs({ offset: 0, pageSize: 200 });
        auditLogs = Array.isArray(auditResult?.logs)
          ? auditResult.logs
          : Array.isArray(auditResult)
            ? auditResult
            : [];
      } catch (auditError) {
        console.log("System log analysis audit load error:", auditError);
      }

      setAnalysis(
        buildSystemLogAnalysis({
          complaints: (data || []).map(mapComplaint),
          auditLogs,
        })
      );
    } catch (error) {
      console.log("System log analysis catch:", error);
      setAnalysis(buildSystemLogAnalysis({ complaints: [], auditLogs: [] }));
    } finally {
      setLoading(false);
    }
  }, []);

  // --- [SYSTEM LOG MODAL] Reload when modal opens ---
  useEffect(() => {
    if (!visible) return;
    loadAnalysis();
  }, [visible, loadAnalysis]);

  // --- [SYSTEM LOG MODAL] Render ---
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* [SYSTEM LOG MODAL UI] Drag handle */}
          <View style={styles.handle} />

          {/* [SYSTEM LOG MODAL UI] Header: title & close button */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>System Log Analysis</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Feather name="x" size={20} color="rgba(23, 23, 23, 1)" />
            </TouchableOpacity>
          </View>

          {/* [SYSTEM LOG MODAL UI] Loading state or analysis results */}
          {loading || !analysis ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" />
              <Text style={styles.loadingText}>Analyzing system logs...</Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.content}
            >
              <Text style={styles.intro}>
                Evaluates AI accuracy, complaint processing time, and resolution
                performance from stored system activity and complaint lifecycle
                records.
              </Text>

              {/* [SYSTEM LOG MODAL UI] AI Accuracy metrics */}
              <Text style={styles.groupTitle}>AI Accuracy</Text>
              <View style={styles.metricRow}>
                <MetricBox
                  label="Overall"
                  value={analysis.labels.overallAccuracy}
                />
                <MetricBox
                  label="Routing"
                  value={analysis.labels.routingAccuracy}
                />
                <MetricBox
                  label="Category"
                  value={analysis.labels.categoryAccuracy}
                />
              </View>
              <Text style={styles.hint}>
                Based on {analysis.aiAccuracy.comparableComplaints} comparable
                AI-routed complaints
                {analysis.aiAccuracy.overrideCount
                  ? ` • ${analysis.aiAccuracy.overrideCount} routing overrides`
                  : ""}
                .
              </Text>

              {/* [SYSTEM LOG MODAL UI] Processing Time metrics */}
              <Text style={styles.groupTitle}>Processing Time</Text>
              <View style={styles.metricRow}>
                <MetricBox
                  label="To In Progress"
                  value={analysis.labels.avgSubmitToInProgress}
                />
                <MetricBox
                  label="To Validation"
                  value={analysis.labels.avgSubmitToValidation}
                />
                <MetricBox
                  label="To Completed"
                  value={analysis.labels.avgSubmitToCompleted}
                />
              </View>
              <Text style={styles.hint}>
                Average time from submission
                {analysis.processingTime.sampleCompleted
                  ? ` • median completed ${analysis.labels.medianSubmitToCompleted}`
                  : ""}
                .
              </Text>

              {/* [SYSTEM LOG MODAL UI] Resolution Performance metrics */}
              <Text style={styles.groupTitle}>Resolution Performance</Text>
              <View style={styles.metricRow}>
                <MetricBox
                  label="Completion"
                  value={analysis.labels.completionRate}
                />
                <MetricBox
                  label="Return Rate"
                  value={analysis.labels.returnRate}
                />
                <MetricBox
                  label="Validation Pass"
                  value={analysis.labels.validationPassRate}
                />
              </View>
              <Text style={styles.hint}>
                {analysis.resolutionPerformance.completedCount} completed of{" "}
                {analysis.resolutionPerformance.totalComplaints} complaints
                {analysis.resolutionPerformance.validatedCount
                  ? ` • ${analysis.resolutionPerformance.validationResolvedCount}/${analysis.resolutionPerformance.validatedCount} citizen validations marked resolved`
                  : ""}
                .
              </Text>

              {/* [SYSTEM LOG MODAL UI] Refresh button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.refreshButton}
                onPress={loadAnalysis}
              >
                <Ionicons name="refresh" size={16} color="rgba(255, 255, 255, 1)" />
                <Text style={styles.refreshText}>Refresh Analysis</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ===== [SYSTEM LOG MODAL] Styles =====
const styles = StyleSheet.create({
  // --- Sheet & header ---
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  sheet: {
    maxHeight: "88%",
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(213, 218, 211, 1)",
    marginBottom: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "rgba(23, 23, 23, 1)",
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
  },

  // --- Loading & content ---
  loadingBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },

  loadingText: {
    marginTop: 10,
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
  },

  content: {
    paddingBottom: 18,
  },

  intro: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 18,
    marginBottom: 14,
  },

  groupTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 8,
    marginTop: 4,
  },

  // --- Metrics & refresh button ---
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },

  metricBox: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(234, 246, 228, 1)",
    borderWidth: 1,
    borderColor: "rgba(198, 228, 192, 1)",
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: "center",
  },

  metricLabel: {
    fontFamily: "Poppins_500Medium",
    fontSize: 9.5,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    marginBottom: 4,
  },

  metricValue: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "rgba(8, 122, 13, 1)",
    textAlign: "center",
  },

  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 15,
    marginBottom: 12,
  },

  refreshButton: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "rgba(8, 122, 13, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  refreshText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(255, 255, 255, 1)",
  },
});

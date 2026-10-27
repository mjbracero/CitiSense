// ===== [OFFICE STATUS UI] Per-department progress for multi-office complaints =====
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchComplaintOfficeStatuses,
  isMultiOfficeComplaint,
  officeMatchesDepartment,
  summarizeOfficeStatuses,
} from "../lib/officeStatus";

const STATUS_COLORS = {
  Pending: { bg: "rgba(255, 246, 232, 1)", color: "rgba(196, 112, 0, 1)" },
  "In Progress": { bg: "rgba(235, 243, 255, 1)", color: "rgba(25, 103, 210, 1)" },
  "For Validation": { bg: "rgba(243, 234, 255, 1)", color: "rgba(122, 62, 168, 1)" },
  Completed: { bg: "rgba(233, 246, 234, 1)", color: "rgba(8, 122, 13, 1)" },
  Returned: { bg: "rgba(255, 240, 240, 1)", color: "rgba(215, 25, 32, 1)" },
};

/**
 * Renders nothing for single-office complaints. `refreshKey` lets the parent
 * reload after a status change (e.g. pass the complaint's current status).
 */
export default function OfficeStatusBreakdown({
  complaintId,
  assignedOffice,
  refreshKey,
  myOffice,
}) {
  const multiOffice = isMultiOfficeComplaint(assignedOffice);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!multiOffice || !complaintId) {
      setRows([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    fetchComplaintOfficeStatuses(complaintId)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((error) => {
        console.log("Office status load error:", error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [complaintId, assignedOffice, refreshKey, multiOffice]);

  if (!multiOffice) return null;

  const { total, done } = summarizeOfficeStatuses(rows);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons name="git-network-outline" size={17} color="rgba(8, 122, 13, 1)" />
        <Text style={styles.title}>Department Progress</Text>
        {total > 0 ? (
          <Text style={styles.summary}>
            {done}/{total} done
          </Text>
        ) : null}
      </View>

      <Text style={styles.hint}>
        This concern is shared by multiple departments. Each department updates its own
        status; it goes to validation once all are done.
      </Text>

      {loading && !rows.length ? (
        <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" style={styles.loader} />
      ) : (
        rows.map((row) => {
          const colors = STATUS_COLORS[row.status] || STATUS_COLORS.Pending;
          const isMine = officeMatchesDepartment(row.office, myOffice);

          return (
            <View key={row.office} style={styles.row}>
              <Text style={styles.office} numberOfLines={2}>
                {row.office}
                {isMine ? <Text style={styles.mine}> (Your office)</Text> : null}
              </Text>
              <View style={[styles.pill, { backgroundColor: colors.bg }]}>
                <Text style={[styles.pillText, { color: colors.color }]}>{row.status}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    padding: 14,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    flex: 1,
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(8, 122, 13, 1)",
  },
  summary: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(65, 73, 62, 1)",
  },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 4,
    marginBottom: 8,
  },
  loader: {
    marginVertical: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(238, 241, 237, 1)",
    gap: 10,
  },
  office: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: "rgba(33, 37, 33, 1)",
  },
  mine: {
    fontFamily: "Poppins_600SemiBold",
    color: "rgba(8, 122, 13, 1)",
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
  },
});

import { Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import { useHideBottomNav } from "./PersistentBottomNav";

// ===== [SYSTEM BACKUP MODAL] Backup API helpers =====
const BACKUP_API_URL = String(process.env.EXPO_PUBLIC_BACKUP_API_URL || "").replace(
  /\/+$/,
  ""
);
const POLL_INTERVAL_MS = 5000;

export const BACKUP_API_CONFIGURED = Boolean(BACKUP_API_URL);

async function backupApi(path, options = {}) {
  if (!BACKUP_API_URL) {
    throw new Error("Backup server is not configured (EXPO_PUBLIC_BACKUP_API_URL).");
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error("Please sign in again.");

  const response = await fetch(`${BACKUP_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || `Backup server error (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function countStorageFiles(storage) {
  return Object.values(storage || {}).reduce(
    (sum, bucket) => sum + (Number(bucket?.files) || 0),
    0
  );
}

// ===== [SYSTEM BACKUP MODAL] Subcomponent: metric box =====
function MetricBox({ label, value, tone = "good" }) {
  return (
    <View style={[styles.metricBox, tone === "bad" && styles.metricBoxBad]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "bad" && styles.metricValueBad]}>
        {value}
      </Text>
    </View>
  );
}

// ===== [SYSTEM BACKUP MODAL] Exported modal =====
/**
 * Admin Settings → System Backup
 * Status, manual trigger, and downloads for the independent backup server.
 */
export default function SystemBackupModal({ visible, onClose }) {
  // --- [SYSTEM BACKUP MODAL] State, insets & fonts ---
  const insets = useSafeAreaInsets();
  useHideBottomNav(visible);

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [errorText, setErrorText] = useState("");
  const [starting, setStarting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const pollRef = useRef(null);

  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [SYSTEM BACKUP MODAL] Load status + history ---
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [statusResult, listResult] = await Promise.all([
        backupApi("/status"),
        backupApi("/backups"),
      ]);
      setStatus(statusResult);
      setBackups(Array.isArray(listResult?.backups) ? listResult.backups : []);
      setErrorText("");
    } catch (error) {
      setErrorText(error?.message || "Unable to reach the backup server.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadData();
  }, [visible, loadData]);

  // --- [SYSTEM BACKUP MODAL] Poll while a backup is running ---
  const isRunning = Boolean(status?.running);
  useEffect(() => {
    if (!visible || !isRunning) return undefined;
    pollRef.current = setInterval(() => loadData({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, isRunning, loadData]);

  // --- [SYSTEM BACKUP MODAL] Actions ---
  const startBackup = useCallback(async () => {
    setStarting(true);
    try {
      await backupApi("/backup", { method: "POST" });
      toast("Backup Started", "This may take a few minutes.", "success");
    } catch (error) {
      toast(
        error?.status === 409 ? "Backup Running" : "Backup Failed",
        error?.message || "Unable to start backup.",
        error?.status === 409 ? "info" : "error"
      );
    } finally {
      setStarting(false);
      setTimeout(() => loadData({ silent: true }), 800);
    }
  }, [loadData]);

  const downloadBackup = useCallback(async (id) => {
    setDownloadingId(id);
    try {
      const { url } = await backupApi(`/backups/${encodeURIComponent(id)}/link`, {
        method: "POST",
      });
      await Linking.openURL(url);
    } catch (error) {
      toast("Download Failed", error?.message || "Unable to download backup.", "error");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  const lastSuccess = status?.lastSuccess;
  const withinRpo = Boolean(status?.withinRpo);

  // --- [SYSTEM BACKUP MODAL] Render ---
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* [SYSTEM BACKUP MODAL UI] Drag handle */}
          <View style={styles.handle} />

          {/* [SYSTEM BACKUP MODAL UI] Header: title & close button */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>System Backup</Text>
            <TouchableOpacity activeOpacity={0.75} style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={20} color="rgba(23, 23, 23, 1)" />
            </TouchableOpacity>
          </View>

          {loading && !status ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" />
              <Text style={styles.loadingText}>Checking backup server...</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <Text style={styles.intro}>
                Copies the database, user accounts, and complaint photos to the
                CitiSense backup server every night, outside Supabase.
              </Text>

              {errorText ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-triangle" size={14} color="rgba(185, 28, 28, 1)" />
                  <Text style={styles.errorText}>{errorText}</Text>
                </View>
              ) : null}

              {/* [SYSTEM BACKUP MODAL UI] Recovery metrics */}
              {status ? (
                <>
                  <Text style={styles.groupTitle}>Recovery Status</Text>
                  <View style={styles.metricRow}>
                    <MetricBox
                      label="RPO Target"
                      value={`${status.rpoHours ?? 24} hrs`}
                    />
                    <MetricBox
                      label="Last Backup"
                      value={
                        status.hoursSinceLastSuccess == null
                          ? "None"
                          : `${status.hoursSinceLastSuccess} hrs ago`
                      }
                      tone={withinRpo ? "good" : "bad"}
                    />
                    <MetricBox
                      label="Status"
                      value={isRunning ? "Running" : withinRpo ? "Protected" : "At Risk"}
                      tone={withinRpo || isRunning ? "good" : "bad"}
                    />
                  </View>
                  <Text style={styles.hint}>
                    {lastSuccess
                      ? `Last successful backup ${formatDateTime(lastSuccess.finishedAt)} • ${formatSize(lastSuccess.sizeBytes)}`
                      : "No successful backup yet."}
                    {status.schedule
                      ? ` • Nightly schedule (${status.schedule.timezone}) • Kept ${status.retentionDays} days.`
                      : ""}
                  </Text>
                </>
              ) : null}

              {/* [SYSTEM BACKUP MODAL UI] Backup now */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.primaryButton, (isRunning || starting) && styles.buttonDisabled]}
                disabled={isRunning || starting || Boolean(errorText && !status)}
                onPress={startBackup}
              >
                {isRunning || starting ? (
                  <ActivityIndicator size="small" color="rgba(255, 255, 255, 1)" />
                ) : (
                  <Feather name="database" size={16} color="rgba(255, 255, 255, 1)" />
                )}
                <Text style={styles.primaryButtonText}>
                  {isRunning ? "Backup in progress..." : "Back Up Now"}
                </Text>
              </TouchableOpacity>

              {/* [SYSTEM BACKUP MODAL UI] History */}
              <Text style={[styles.groupTitle, { marginTop: 16 }]}>Backup History</Text>
              {backups.length === 0 ? (
                <Text style={styles.hint}>No backups found on the server.</Text>
              ) : (
                backups.map((item) => {
                  const ok = item.status === "success";
                  const failed = item.status === "failed";
                  return (
                    <View key={item.id} style={styles.historyRow}>
                      <View
                        style={[
                          styles.historyIcon,
                          failed && styles.historyIconBad,
                          !ok && !failed && styles.historyIconRunning,
                        ]}
                      >
                        <Feather
                          name={ok ? "check" : failed ? "x" : "clock"}
                          size={14}
                          color="rgba(255, 255, 255, 1)"
                        />
                      </View>
                      <View style={styles.historyBody}>
                        <Text style={styles.historyTitle}>{formatDateTime(item.startedAt)}</Text>
                        <Text style={styles.historyMeta} numberOfLines={2}>
                          {ok
                            ? `${formatSize(item.sizeBytes)} • ${countStorageFiles(item.storage)} photos • ${item.trigger}`
                            : failed
                              ? `Failed: ${item.error || "Unknown error"}`
                              : "Running..."}
                        </Text>
                      </View>
                      {ok ? (
                        <TouchableOpacity
                          activeOpacity={0.75}
                          style={styles.downloadButton}
                          disabled={downloadingId === item.id}
                          onPress={() => downloadBackup(item.id)}
                        >
                          {downloadingId === item.id ? (
                            <ActivityIndicator size="small" color="rgba(8, 122, 13, 1)" />
                          ) : (
                            <Feather name="download" size={16} color="rgba(8, 122, 13, 1)" />
                          )}
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })
              )}

              {/* [SYSTEM BACKUP MODAL UI] Refresh button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.secondaryButton}
                onPress={() => loadData()}
              >
                <Ionicons name="refresh" size={16} color="rgba(8, 122, 13, 1)" />
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ===== [SYSTEM BACKUP MODAL] Styles =====
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

  // --- Loading, content & errors ---
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

  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "rgba(254, 242, 242, 1)",
    borderWidth: 1,
    borderColor: "rgba(254, 202, 202, 1)",
    padding: 10,
    marginBottom: 12,
  },

  errorText: {
    flex: 1,
    fontFamily: "Poppins_500Medium",
    fontSize: 11,
    color: "rgba(185, 28, 28, 1)",
    lineHeight: 16,
  },

  groupTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 8,
    marginTop: 4,
  },

  // --- Metrics ---
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

  metricBoxBad: {
    backgroundColor: "rgba(254, 242, 242, 1)",
    borderColor: "rgba(254, 202, 202, 1)",
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
    fontSize: 13,
    color: "rgba(8, 122, 13, 1)",
    textAlign: "center",
  },

  metricValueBad: {
    color: "rgba(185, 28, 28, 1)",
  },

  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 15,
    marginBottom: 12,
  },

  // --- Buttons ---
  primaryButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "rgba(8, 122, 13, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  primaryButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(255, 255, 255, 1)",
  },

  secondaryButton: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(198, 228, 192, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  secondaryButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(8, 122, 13, 1)",
  },

  // --- History ---
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },

  historyIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  historyIconBad: {
    backgroundColor: "rgba(185, 28, 28, 1)",
  },

  historyIconRunning: {
    backgroundColor: "rgba(202, 138, 4, 1)",
  },

  historyBody: {
    flex: 1,
  },

  historyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(23, 23, 23, 1)",
  },

  historyMeta: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 2,
  },

  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(234, 246, 228, 1)",
  },
});

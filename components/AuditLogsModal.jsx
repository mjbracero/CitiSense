import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { fetchAuditLogs, AUDIT_LOGS_PAGE_SIZE } from "../lib/auditLogService";
import ComplaintsLoadMoreFooter from "./ComplaintsLoadMoreFooter";
import { useHideBottomNav } from "./PersistentBottomNav";
import { AuditLogListSkeleton } from "./skeletons";

// ===== [AUDIT LOGS MODAL] Helpers: date/time formatting, icon style per action =====
function formatLogDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unknown date";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLogTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getLogStyle(action) {
  const clean = String(action || "").toLowerCase();

  if (clean.includes("login") || clean.includes("signup")) {
    return { icon: "log-in", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("logout")) {
    return { icon: "log-out", color: "rgba(215, 25, 32, 1)", bg: "rgba(255, 240, 240, 1)" };
  }

  if (clean.includes("password")) {
    return { icon: "lock", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("avatar") || clean.includes("photo")) {
    return { icon: "camera", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("push") || clean.includes("email_alert")) {
    return { icon: "bell", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("location")) {
    return { icon: "map-pin", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("profile")) {
    return { icon: "user", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("complete")) {
    return { icon: "check-circle", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("reassign")) {
    return { icon: "shuffle", color: "rgba(8, 122, 13, 1)", bg: "rgba(234, 246, 228, 1)" };
  }

  if (clean.includes("export") || clean.includes("csv")) {
    return { icon: "download", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("ai_validation")) {
    return { icon: "zap", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("notification")) {
    return { icon: "bell", color: "rgba(111, 119, 111, 1)", bg: "rgba(241, 244, 241, 1)" };
  }

  if (clean.includes("status") || clean.includes("return")) {
    return { icon: "refresh-cw", color: "rgba(244, 162, 76, 1)", bg: "rgba(255, 242, 232, 1)" };
  }

  if (clean.includes("validation")) {
    return { icon: "clipboard", color: "rgba(244, 162, 76, 1)", bg: "rgba(255, 248, 235, 1)" };
  }

  if (clean.includes("submit") || clean.includes("complaint")) {
    return { icon: "file-text", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("role")) {
    return { icon: "edit-3", color: "rgba(49, 90, 154, 1)", bg: "rgba(232, 238, 255, 1)" };
  }

  if (clean.includes("ban")) {
    return { icon: "slash", color: "rgba(215, 25, 32, 1)", bg: "rgba(255, 240, 240, 1)" };
  }

  if (clean.includes("delete") || clean.includes("user")) {
    return { icon: "user-x", color: "rgba(215, 25, 32, 1)", bg: "rgba(255, 240, 240, 1)" };
  }

  return { icon: "activity", color: "rgba(111, 119, 111, 1)", bg: "rgba(241, 244, 241, 1)" };
}

// ===== [AUDIT LOGS MODAL] Subcomponent: single log row =====
function AuditLogRow({ item }) {
  const style = getLogStyle(item.action);

  return (
    <View style={styles.logRow}>
      <View style={[styles.logIcon, { backgroundColor: style.bg }]}>
        <Feather name={style.icon} size={16} color={style.color} />
      </View>

      <View style={styles.logTextBox}>
        <Text style={styles.logTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={styles.logDescription} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.logTime}>
          {formatLogDate(item.created_at)} · {formatLogTime(item.created_at)}
        </Text>
      </View>
    </View>
  );
}

// ===== [AUDIT LOGS MODAL] Exported modal component =====
export default function AuditLogsModal({
  visible,
  onClose,
}) {
  // --- [AUDIT LOGS MODAL] State & pagination refs ---
  const [logs, setLogs] = useState([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const logsRef = useRef([]);
  const remoteOffsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);

  // --- [AUDIT LOGS MODAL] Hide bottom nav while open ---
  useHideBottomNav(visible);

  // --- [AUDIT LOGS MODAL] Load logs (initial, refresh, append page) ---
  const loadLogs = useCallback(async (showLoader = true, append = false) => {
    if (append) {
      if (loadingMoreRef.current || !hasMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else if (showLoader) {
      setLoading(true);
    }

    const offset = append ? remoteOffsetRef.current : 0;
    const pageSize = append
      ? AUDIT_LOGS_PAGE_SIZE
      : Math.max(AUDIT_LOGS_PAGE_SIZE, logsRef.current.length || 0);

    const result = await fetchAuditLogs({ offset, pageSize });
    const incoming = result.logs || [];

    if (!append) {
      remoteOffsetRef.current = result.remotePageLength || 0;
    } else {
      remoteOffsetRef.current += result.remotePageLength || 0;
    }

    const nextLogs = append
      ? [...logsRef.current, ...incoming].filter(
          (item, index, list) =>
            list.findIndex((entry) => entry.id === item.id) === index
        )
      : incoming;

    logsRef.current = nextLogs;
    setLogs(nextLogs);
    setLogsTotal(result.total ?? nextLogs.length);

    const more = result.hasMore !== false;
    hasMoreRef.current = more;
    setHasMore(more);

    setLoading(false);
    setRefreshing(false);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, []);

  // --- [AUDIT LOGS MODAL] Reload when modal opens ---
  useEffect(() => {
    if (visible) {
      remoteOffsetRef.current = 0;
      hasMoreRef.current = true;
      loadLogs(true);
    }
  }, [visible, loadLogs]);

  // --- [AUDIT LOGS MODAL] Render ---
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* [AUDIT LOGS MODAL UI] Drag handle */}
          <View style={styles.handle} />

          {/* [AUDIT LOGS MODAL UI] Header: title, count, close button */}
          <View style={styles.headerRow}>
            <View style={styles.headerTextBox}>
              <Text style={styles.title}>Audit Logs</Text>
              <Text style={styles.subtitle}>
                Your recent account activity
                {logsTotal > 0 ? ` · ${logs.length} of ${logsTotal}` : ""}.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
            </TouchableOpacity>
          </View>

          {/* [AUDIT LOGS MODAL UI] Skeleton or paginated log list (with empty state) */}
          {loading ? (
            <AuditLogListSkeleton count={7} />
          ) : (
            <FlatList
              data={logs}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <AuditLogRow item={item} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    loadLogs(false);
                  }}
                  tintColor="rgba(8, 122, 13, 1)"
                  colors={["rgba(8, 122, 13, 1)"]}
                />
              }
              onEndReached={() => {
                if (!hasMore) return;
                loadLogs(false, true);
              }}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                <ComplaintsLoadMoreFooter
                  loading={loadingMore}
                  label="Loading more activity..."
                />
              }
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Feather name="activity" size={36} color="rgba(111, 119, 111, 1)" />
                  <Text style={styles.emptyTitle}>No activity yet</Text>
                  <Text style={styles.emptyText}>
                    Your logins, profile changes, and complaint actions will
                    appear here.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ===== [AUDIT LOGS MODAL] Styles =====
const styles = StyleSheet.create({
  // --- Sheet & header ---
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  sheet: {
    maxHeight: "88%",
    minHeight: "62%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },

  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(226, 231, 224, 1)",
    alignSelf: "center",
    marginBottom: 12,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  headerTextBox: {
    flex: 1,
    paddingRight: 12,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "rgba(23, 23, 23, 1)",
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 3,
    lineHeight: 18,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(241, 244, 241, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  loaderBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
  },

  loaderText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 10,
  },

  listContent: {
    paddingBottom: 24,
  },

  // --- Log rows ---
  logRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226, 231, 224, 1)",
  },

  logIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },

  logTextBox: {
    flex: 1,
  },

  logTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 3,
  },

  logDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(51, 51, 51, 1)",
    lineHeight: 18,
    marginBottom: 4,
  },

  logTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: "rgba(111, 119, 111, 1)",
  },

  // --- Empty state ---
  emptyBox: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 12,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
});

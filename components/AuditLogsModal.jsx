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

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const BLUE = "#315A9A";
const ORANGE = "#F4A24C";
const RED = "#D71920";

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
    return { icon: "log-in", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("logout")) {
    return { icon: "log-out", color: RED, bg: "#FFF0F0" };
  }

  if (clean.includes("password")) {
    return { icon: "lock", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("avatar") || clean.includes("photo")) {
    return { icon: "camera", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("push") || clean.includes("email_alert")) {
    return { icon: "bell", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("location")) {
    return { icon: "map-pin", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("profile")) {
    return { icon: "user", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("complete")) {
    return { icon: "check-circle", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("reassign")) {
    return { icon: "shuffle", color: GREEN, bg: LIGHT_GREEN };
  }

  if (clean.includes("export") || clean.includes("csv")) {
    return { icon: "download", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("ai_validation")) {
    return { icon: "zap", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("notification")) {
    return { icon: "bell", color: MUTED, bg: "#F1F4F1" };
  }

  if (clean.includes("status") || clean.includes("return")) {
    return { icon: "refresh-cw", color: ORANGE, bg: "#FFF2E8" };
  }

  if (clean.includes("validation")) {
    return { icon: "clipboard", color: ORANGE, bg: "#FFF8EB" };
  }

  if (clean.includes("submit") || clean.includes("complaint")) {
    return { icon: "file-text", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("role")) {
    return { icon: "edit-3", color: BLUE, bg: "#E8EEFF" };
  }

  if (clean.includes("ban")) {
    return { icon: "slash", color: RED, bg: "#FFF0F0" };
  }

  if (clean.includes("delete") || clean.includes("user")) {
    return { icon: "user-x", color: RED, bg: "#FFF0F0" };
  }

  return { icon: "activity", color: MUTED, bg: "#F1F4F1" };
}

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

export default function AuditLogsModal({
  visible,
  onClose,
}) {
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

  useHideBottomNav(visible);

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

  useEffect(() => {
    if (visible) {
      remoteOffsetRef.current = 0;
      hasMoreRef.current = true;
      loadLogs(true);
    }
  }, [visible, loadLogs]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

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
              <Feather name="x" size={21} color={TEXT} />
            </TouchableOpacity>
          </View>

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
                  tintColor={GREEN}
                  colors={[GREEN]}
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
                  <Feather name="activity" size={36} color={MUTED} />
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

const styles = StyleSheet.create({
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
    backgroundColor: WHITE,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },

  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: BORDER,
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
    color: TEXT,
  },

  subtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    lineHeight: 18,
  },

  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F4F1",
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
    color: MUTED,
    marginTop: 10,
  },

  listContent: {
    paddingBottom: 24,
  },

  logRow: {
    flexDirection: "row",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
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
    color: TEXT,
    marginBottom: 3,
  },

  logDescription: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "#333333",
    lineHeight: 18,
    marginBottom: 4,
  },

  logTime: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11,
    color: MUTED,
  },

  emptyBox: {
    alignItems: "center",
    paddingTop: 48,
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 15,
    color: TEXT,
    marginTop: 12,
  },

  emptyText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
  },
});

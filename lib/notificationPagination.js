import {
  applyOffsetPagination,
  isNearContentBottom,
  mergeComplaintPages,
} from "./complaintPagination";

export const NOTIFICATIONS_PAGE_SIZE = 15;

export const NOTIFICATION_TABLES = {
  citizen: {
    table: "complaint_notifications",
    ownerColumn: "citizen_id",
  },
  admin: {
    table: "admin_notifications",
    ownerColumn: "admin_id",
  },
  departmentHead: {
    table: "moderator_notifications",
    ownerColumn: "moderator_id",
  },
};

export function getNotificationPageSize(append, cachedLength = 0) {
  return append
    ? NOTIFICATIONS_PAGE_SIZE
    : Math.max(NOTIFICATIONS_PAGE_SIZE, cachedLength || 0);
}

export function applyNotificationUnreadFilter(query, selectedFilter) {
  if (selectedFilter === "Unread") {
    return query.eq("is_read", false);
  }

  return query;
}

export function buildNotificationPageQuery(
  supabaseClient,
  {
    role,
    ownerId,
    offset = 0,
    pageSize = NOTIFICATIONS_PAGE_SIZE,
    selectedFilter = "All",
  }
) {
  const config = NOTIFICATION_TABLES[role];

  if (!config || !ownerId) {
    return Promise.resolve({ data: [], error: null, count: 0 });
  }

  let query = supabaseClient
    .from(config.table)
    .select("*", { count: "exact" })
    .eq(config.ownerColumn, ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyNotificationUnreadFilter(query, selectedFilter);
  query = applyOffsetPagination(query, offset, pageSize);

  return query;
}

export function mergeNotificationPages(existing = [], incoming = [], getKey) {
  return mergeComplaintPages(existing, incoming, getKey);
}

export function computeNotificationHasMore(mappedRows, loadedCount, total) {
  return mappedRows.length > 0 && loadedCount < total;
}

export function getNotificationCacheKey(baseKey, selectedFilter = "All") {
  if (!selectedFilter || selectedFilter === "All") {
    return baseKey;
  }

  return `${baseKey}:${selectedFilter}`;
}

export { isNearContentBottom };

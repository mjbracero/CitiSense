export const COMPLAINTS_PAGE_SIZE = 5;
export const USERS_PAGE_SIZE = 10;
/** Delay between offset pages when bulk-fetching (avoids burst requests). */
export const OFFSET_PAGE_DELAY_MS = 1000;
/** Larger page size for dashboard/analytics bulk reads. */
export const DASHBOARD_STATS_PAGE_SIZE = 1000;

export function computeOffsetHasMore({
  loadedCount,
  lastPageLength,
  total,
  pageSize,
}) {
  if (lastPageLength === 0) return false;

  if (typeof total === "number") {
    return loadedCount < total;
  }

  return lastPageLength >= pageSize;
}

function wait(ms = 0) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pace offset pages (skip when offset is 0). */
export async function waitOffsetPageDelay(
  offset = 0,
  delayMs = OFFSET_PAGE_DELAY_MS
) {
  if (offset > 0 && delayMs > 0) {
    await wait(delayMs);
  }
}

/**
 * Fetch every row from a Supabase query using repeated offset/range pages.
 * Pass delayMs (default OFFSET_PAGE_DELAY_MS) to pace requests between pages.
 */
export async function fetchAllRowsWithOffset(
  loadPage,
  pageSize = COMPLAINTS_PAGE_SIZE,
  { delayMs = OFFSET_PAGE_DELAY_MS } = {}
) {
  const rows = [];
  let offset = 0;
  let total = null;
  let lastError = null;

  while (true) {
    if (offset > 0 && delayMs > 0) {
      await wait(delayMs);
    }

    const result = await loadPage(offset, pageSize);

    if (result?.error) {
      lastError = result.error;
      break;
    }

    if (typeof result?.count === "number") {
      total = result.count;
    }

    const pageRows = Array.isArray(result?.data) ? result.data : [];
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;

    offset += pageRows.length;

    if (typeof total === "number" && offset >= total) break;
  }

  return {
    data: rows,
    error: lastError,
    count: total ?? rows.length,
  };
}

export function getOffsetPageRange(offset = 0, pageSize = COMPLAINTS_PAGE_SIZE) {
  const from = Math.max(0, Number(offset) || 0);

  return {
    from,
    to: from + pageSize - 1,
    pageSize,
  };
}

export function applyOffsetPagination(
  query,
  offset = 0,
  pageSize = COMPLAINTS_PAGE_SIZE
) {
  const { from, to } = getOffsetPageRange(offset, pageSize);
  return query.range(from, to);
}

export function applyComplaintOffsetFilters(query, filters = {}) {
  let next = query;

  if (Array.isArray(filters.statusIn) && filters.statusIn.length > 0) {
    next = next.in("status", filters.statusIn);
  } else if (filters.status) {
    next = next.eq("status", filters.status);
  }

  if (filters.category) {
    next = next.eq("category", filters.category);
  }

  if (filters.priority) {
    next = next.eq("priority", filters.priority);
  }

  if (Array.isArray(filters.priorityIn) && filters.priorityIn.length > 0) {
    next = next.in("priority", filters.priorityIn);
  }

  if (filters.isEmergency === true) {
    next = next.eq("is_emergency", true);
  } else if (filters.isEmergency === false) {
    next = next.eq("is_emergency", false);
  }

  return next;
}

export function mergeComplaintPages(existing = [], incoming = [], getKey) {
  const keyOf = getKey || ((item) => item.rawId || item.id);
  const seen = new Set(existing.map((item) => String(keyOf(item))));

  return [
    ...existing,
    ...incoming.filter((item) => {
      const key = String(keyOf(item));

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    }),
  ];
}

export function isNearContentBottom(nativeEvent, threshold = 140) {
  const { layoutMeasurement, contentOffset, contentSize } = nativeEvent || {};

  if (!layoutMeasurement || !contentOffset || !contentSize) return false;

  return (
    layoutMeasurement.height + contentOffset.y >=
    contentSize.height - threshold
  );
}

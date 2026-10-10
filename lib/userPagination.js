import {
  applyOffsetPagination,
  mergeComplaintPages,
  USERS_PAGE_SIZE,
} from "./complaintPagination";

export { USERS_PAGE_SIZE };

export function getUserPageSize(append, cachedLength = 0) {
  return append
    ? USERS_PAGE_SIZE
    : Math.max(USERS_PAGE_SIZE, cachedLength || 0);
}

function escapeIlike(value = "") {
  return String(value || "")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function quoteOrFilterValue(value) {
  // PostgREST needs quoted values when the pattern contains spaces/commas.
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function resolveSearchFilters(search = "") {
  const raw = String(search || "").trim();
  if (!raw) return [];

  const keyword = escapeIlike(raw);
  const lower = keyword.toLowerCase();
  const pattern = quoteOrFilterValue(`%${keyword}%`);
  const filters = [
    `full_name.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `role.ilike.${pattern}`,
    `department.ilike.${pattern}`,
    `contact_number.ilike.${pattern}`,
  ];

  if (
    lower === "department head" ||
    lower === "dept head" ||
    lower === "moderator"
  ) {
    filters.push("role.eq.moderator");
  }

  if (lower === "citizen") {
    filters.push("role.eq.citizen");
  }

  if (lower === "admin") {
    filters.push("role.eq.admin");
  }

  return filters;
}

export function buildUserPageQuery(
  supabaseClient,
  { offset = 0, pageSize = USERS_PAGE_SIZE, search = "" } = {}
) {
  let query = supabaseClient
    .from("profiles")
    .select(
      "id, email, role, full_name, contact_number, department, avatar_url, created_at, banned_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  const filters = resolveSearchFilters(search);
  if (filters.length) {
    query = query.or(filters.join(","));
  }

  query = applyOffsetPagination(query, offset, pageSize);

  return query;
}

export function mergeUserPages(existing = [], incoming = []) {
  return mergeComplaintPages(existing, incoming, (item) => item.id);
}

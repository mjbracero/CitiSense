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

export function buildUserPageQuery(
  supabaseClient,
  { offset = 0, pageSize = USERS_PAGE_SIZE } = {}
) {
  let query = supabaseClient
    .from("profiles")
    .select(
      "id, email, role, full_name, contact_number, department, avatar_url, created_at, banned_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  query = applyOffsetPagination(query, offset, pageSize);

  return query;
}

export function mergeUserPages(existing = [], incoming = []) {
  return mergeComplaintPages(existing, incoming, (item) => item.id);
}

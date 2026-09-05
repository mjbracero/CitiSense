import { supabase } from "./supabase";

/**
 * Fast head-only COUNT against complaints.
 * @param {(query: any) => any} [buildQuery] optional filter builder
 */
export async function countComplaints(buildQuery) {
  let query = supabase
    .from("complaints")
    .select("*", { count: "exact", head: true });

  if (typeof buildQuery === "function") {
    query = buildQuery(query);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count || 0;
}

/**
 * Run several COUNT queries in parallel.
 * @param {Array<{ key: string, buildQuery?: Function }>} specs
 */
export async function countComplaintsMany(specs = []) {
  const entries = await Promise.all(
    specs.map(async ({ key, buildQuery }) => {
      const value = await countComplaints(buildQuery);
      return [key, value];
    })
  );

  return Object.fromEntries(entries);
}

import { supabase } from "./supabase";

/**
 * Keep public.profiles in sync when a user edits their own account.
 * Uses update_own_profile RPC so RLS cannot silently block the write.
 * Manage Users reads from this table — never overwrite role/banned_at.
 */
export async function syncOwnProfileRow({
  userId,
  fullName,
  email,
  contactNumber,
  barangay,
  department,
  avatarUrl,
} = {}) {
  if (!userId) {
    return { error: new Error("Missing user id") };
  }

  const rpcArgs = {};

  if (fullName !== undefined) {
    const clean = String(fullName || "").trim();
    if (clean) rpcArgs.p_full_name = clean;
  }

  if (email !== undefined) {
    const clean = String(email || "").trim().toLowerCase();
    if (clean) rpcArgs.p_email = clean;
  }

  if (contactNumber !== undefined) {
    rpcArgs.p_contact_number = String(contactNumber || "").trim();
  }

  if (barangay !== undefined) {
    rpcArgs.p_barangay = String(barangay || "").trim();
  }

  if (department !== undefined) {
    rpcArgs.p_department = String(department || "").trim();
  }

  if (avatarUrl !== undefined) {
    rpcArgs.p_avatar_url = String(avatarUrl || "").trim();
  }

  if (Object.keys(rpcArgs).length === 0) {
    return { error: null, data: null };
  }

  const { data, error } = await supabase.rpc("update_own_profile", rpcArgs);

  if (error) {
    console.log("Sync own profile RPC error:", error);

    // Fallback for projects that have not applied the RPC migration yet.
    const patch = {};
    if (rpcArgs.p_full_name) patch.full_name = rpcArgs.p_full_name;
    if (rpcArgs.p_email) patch.email = rpcArgs.p_email;
    if (contactNumber !== undefined) {
      patch.contact_number = String(contactNumber || "").trim() || null;
    }
    if (barangay !== undefined) {
      patch.barangay = String(barangay || "").trim() || null;
    }
    if (department !== undefined) {
      patch.department = String(department || "").trim() || null;
    }
    if (avatarUrl !== undefined) {
      patch.avatar_url = String(avatarUrl || "").trim() || null;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select(
        "id, email, role, full_name, contact_number, department, avatar_url, banned_at"
      );

    if (updateError) {
      console.log("Sync own profile fallback error:", updateError);
      return { error: updateError, data: null };
    }

    if (!updatedRows?.length) {
      console.log(
        "Sync own profile fallback updated 0 rows (likely RLS). Apply update_own_profile migration."
      );
      return {
        error: new Error("Profile update blocked. Apply latest Supabase migration."),
        data: null,
      };
    }

    return { error: null, data: updatedRows[0] };
  }

  return { error: null, data: Array.isArray(data) ? data[0] : data };
}

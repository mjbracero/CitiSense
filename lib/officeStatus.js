// ===== [OFFICE STATUS] Per-department status for multi-office complaints =====
// Backed by public.complaint_office_status (one row per office per complaint)
// and the update_my_office_complaint_status RPC.
import { supabase } from "./supabase";

export function splitAssignedOffices(assignedOffice) {
  return [
    ...new Set(
      String(assignedOffice || "")
        .split(/\s*&\s*/)
        .map((office) => office.trim())
        .filter((office) => office && office.toLowerCase() !== "unassigned")
    ),
  ];
}

export function isMultiOfficeComplaint(assignedOffice) {
  return splitAssignedOffices(assignedOffice).length > 1;
}

export async function fetchComplaintOfficeStatuses(complaintId) {
  if (!complaintId) return [];

  const { data, error } = await supabase
    .from("complaint_office_status")
    .select("office, status, updated_at")
    .eq("complaint_id", complaintId)
    .order("office", { ascending: true });

  if (error) throw error;
  return data || [];
}

/** Updates only the signed-in department head's office; returns the complaint row. */
export async function updateMyOfficeComplaintStatus(complaintId, status) {
  const { data, error } = await supabase.rpc("update_my_office_complaint_status", {
    p_complaint_id: complaintId,
    p_status: status,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

/** Adds one more office to a complaint the signed-in department head handles. */
export async function addOfficeToComplaint(complaintId, office) {
  const { data, error } = await supabase.rpc("add_office_to_complaint", {
    p_complaint_id: complaintId,
    p_office: office,
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data;
}

function normalizeOfficeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/'+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Same loose match as public.office_matches_moderator_department. */
export function officeMatchesDepartment(office, department) {
  const a = normalizeOfficeName(office);
  const b = normalizeOfficeName(department);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function findOfficeStatusForDepartment(rows = [], department) {
  return rows.find((row) => officeMatchesDepartment(row.office, department)) || null;
}

export function summarizeOfficeStatuses(rows = []) {
  const total = rows.length;
  const done = rows.filter((row) =>
    ["For Validation", "Completed"].includes(row.status)
  ).length;
  return { total, done };
}

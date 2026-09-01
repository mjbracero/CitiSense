import { supabase } from "./supabase";

function isMissingTableError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("complaint_feedback") && message.includes("schema cache")) ||
    (message.includes("complaint_feedback") && message.includes("does not exist"))
  );
}

export function canCitizenSubmitValidation(complaint) {
  const status = String(complaint?.status || "").trim();
  const feedbackStatus = String(
    complaint?.latestFeedbackStatus || ""
  )
    .trim()
    .toLowerCase();

  // After admin return, status is In Progress — citizen must wait until
  // the department head sets For Validation again before resubmitting.
  if (status !== "For Validation") return false;

  if (feedbackStatus === "returned") return true;

  return !complaint?.validationSubmitted;
}

export function isValidationResubmit(complaint) {
  const status = String(complaint?.status || "").trim();
  const feedbackStatus = String(
    complaint?.latestFeedbackStatus || ""
  )
    .trim()
    .toLowerCase();

  return status === "For Validation" && feedbackStatus === "returned";
}

export async function getLatestFeedbackStatusByComplaintIds(complaintIds = []) {
  const ids = [...new Set((complaintIds || []).filter(Boolean))];

  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("complaint_feedback")
    .select("complaint_id, status, created_at")
    .in("complaint_id", ids)
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingTableError(error)) {
      console.log("Load complaint feedback status error:", error);
    }
    return {};
  }

  const latest = {};

  for (const row of data || []) {
    if (row?.complaint_id && latest[row.complaint_id] == null) {
      latest[row.complaint_id] = row.status;
    }
  }

  return latest;
}

export async function insertComplaintFeedback({
  complaintId,
  citizenId,
  answer,
  feedback,
  photoUrls = [],
} = {}) {
  if (!complaintId || !citizenId) {
    return { data: null, error: new Error("Missing complaint or citizen.") };
  }

  const now = new Date().toISOString();

  const { error: supersedeError } = await supabase
    .from("complaint_feedback")
    .update({ status: "superseded", updated_at: now })
    .eq("complaint_id", complaintId)
    .in("status", ["submitted", "returned"]);

  if (isMissingTableError(supersedeError)) {
    return { data: null, error: supersedeError, missingTable: true };
  }

  if (supersedeError) {
    console.log("Supersede previous complaint feedback error:", supersedeError);
  }

  const { data, error } = await supabase
    .from("complaint_feedback")
    .insert({
      complaint_id: complaintId,
      citizen_id: citizenId,
      status: "submitted",
      answer,
      feedback,
      photo_urls: photoUrls,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.log("Insert complaint feedback error:", error);
  }

  return { data, error, missingTable: isMissingTableError(error) };
}

export async function updateComplaintFeedbackAi(feedbackId, payload = {}) {
  if (!feedbackId) return { error: null };

  const { error } = await supabase
    .from("complaint_feedback")
    .update({
      ai_validation_status: payload.ai_validation_status ?? null,
      ai_validation_approved:
        payload.ai_validation_approved ?? payload.approved ?? null,
      ai_validation_summary: payload.ai_validation_summary ?? payload.summary ?? null,
      ai_validation_reason: payload.ai_validation_reason ?? payload.reason ?? null,
      ai_validation_result: payload.ai_validation_result || payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", feedbackId);

  if (error && !isMissingTableError(error)) {
    console.log("Update complaint feedback AI error:", error);
  }

  return { error };
}

export async function markComplaintFeedbackReturned(complaintId) {
  if (!complaintId) return { error: null };

  const { error } = await supabase
    .from("complaint_feedback")
    .update({
      status: "returned",
      updated_at: new Date().toISOString(),
    })
    .eq("complaint_id", complaintId)
    .eq("status", "submitted");

  if (error && !isMissingTableError(error)) {
    console.log("Mark complaint feedback returned error:", error);
  }

  return { error, missingTable: isMissingTableError(error) };
}

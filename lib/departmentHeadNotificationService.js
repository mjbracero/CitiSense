import { sendRolePushNotification } from "./notificationPush";
import { parseAssignedOffices } from "./complaintCategories";
import { supabase } from "./supabase";

/**
 * Returns a human-readable complaint reference for notifications.
 * Prefers short_id when available; falls back to the UI display id.
 */
function getComplaintLabel(complaint = {}) {
  if (complaint.short_id) return String(complaint.short_id);
  if (complaint.shortId) return String(complaint.shortId);

  // Mapped UI complaints often keep the display short id in `id` and UUID in `rawId`.
  if (complaint.rawId && complaint.id && String(complaint.rawId) !== String(complaint.id)) {
    return String(complaint.id);
  }

  if (complaint.id) {
    const id = String(complaint.id);
    return id.length > 12 ? id.slice(0, 8) : id;
  }

  return "N/A";
}

export async function getDepartmentHeadIdsByDepartment(department) {
  const offices = parseAssignedOffices(department);

  if (offices.length === 0) {
    return [];
  }

  const ids = new Set();

  for (const office of offices) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "moderator")
      .eq("department", office);

    if (error) {
      console.log("Load department heads by department error:", error);
      continue;
    }

    for (const profile of data || []) {
      if (profile?.id) {
        ids.add(profile.id);
      }
    }
  }

  return Array.from(ids);
}

export async function createDepartmentHeadNotificationAndPush({
  departmentHeadId,
  complaintId,
  type,
  title,
  message,
  status,
  category,
  department,
  locationText,
  metadata = {},
}) {
  if (!departmentHeadId || !complaintId) {
    return {
      success: false,
      error: new Error("Missing department head or complaint id."),
    };
  }

  const { data, error } = await supabase
    .from("moderator_notifications")
    .insert({
      moderator_id: departmentHeadId,
      complaint_id: complaintId,
      type,
      title,
      message,
      status,
      category,
      department,
      location_text: locationText,
      is_read: false,
      metadata,
    })
    .select("id, moderator_id, complaint_id, title, message")
    .single();

  if (error) {
    console.log("Create department head notification error:", error);
    return { success: false, error };
  }

  const pushResult = await sendRolePushNotification({
    userId: departmentHeadId,
    title,
    body: message,
    role: "departmentHead",
    complaintId,
    notificationId: data.id,
  });

  return {
    success: true,
    notification: data,
    pushSent: pushResult.pushSent,
    pushError: pushResult.pushError,
  };
}

export async function notifyDepartmentHeadsInDepartment({
  department,
  complaintId,
  type,
  title,
  message,
  status,
  category,
  locationText,
  metadata = {},
  excludeDepartmentHeadId = null,
}) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "notify-department-heads",
      {
        body: {
          department,
          complaintId,
          type,
          title,
          message,
          status,
          category,
          locationText,
          metadata,
          excludeDepartmentHeadId,
        },
      }
    );

    if (!error && data && !data.error) {
      const notifiedCount = data.notifiedCount || 0;
      const skipped = (data.results || []).some((result) => result.skipped);

      // Prefer the edge path when it actually notified someone (or skipped a duplicate).
      // Fall through to the client path when no department heads matched.
      if (notifiedCount > 0 || skipped) {
        return {
          success: true,
          notifiedCount,
          results: data.results || [],
          source: "edge",
        };
      }
    }

    if (error) {
      console.log("Notify department heads edge error:", error);
    } else if (data?.error) {
      console.log("Notify department heads edge response:", data);
    } else if (data && !data.error) {
      console.log(
        "Notify department heads edge matched nobody; trying client fallback."
      );
    }
  } catch (edgeError) {
    console.log("Notify department heads edge catch:", edgeError);
  }

  const departmentHeadIds = await getDepartmentHeadIdsByDepartment(department);
  const targetIds = departmentHeadIds.filter((id) => id !== excludeDepartmentHeadId);

  if (targetIds.length === 0) {
    return { success: true, notifiedCount: 0, results: [] };
  }

  const results = [];

  for (const departmentHeadId of targetIds) {
    results.push(
      await createDepartmentHeadNotificationAndPush({
        departmentHeadId,
        complaintId,
        type,
        title,
        message,
        status,
        category,
        department,
        locationText,
        metadata,
      })
    );
  }

  const notifiedCount = results.filter((result) => result.success).length;

  return { success: notifiedCount > 0, notifiedCount, results };
}

export async function notifyDepartmentHeadsNewAssignment({
  complaint,
  department,
  excludeDepartmentHeadId = null,
}) {
  const complaintId = complaint.id;
  const shortId = getComplaintLabel(complaint);
  const assignedOffice = department || complaint.assigned_office;
  const isMultiDept = String(assignedOffice || "").includes(" & ");

  return notifyDepartmentHeadsInDepartment({
    department: assignedOffice,
    complaintId,
    type: "new_assignment",
    title: "New Complaint Assigned",
    message: isMultiDept
      ? `Complaint #${shortId} was assigned to both ${assignedOffice}.`
      : `Complaint #${shortId} was assigned to ${assignedOffice}.`,
    status: complaint.status || "Pending",
    category: complaint.category,
    department: assignedOffice,
    locationText: complaint.location_text,
    excludeDepartmentHeadId,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: assignedOffice,
      location_text: complaint.location_text,
      new_status: complaint.status || "Pending",
    },
  });
}

export async function notifyDepartmentHeadsReassigned({
  complaint,
  newDepartment,
  oldDepartment,
  reason,
  excludeDepartmentHeadId = null,
}) {
  const complaintId = complaint.id || complaint.rawId;
  const shortId = getComplaintLabel(complaint);

  return notifyDepartmentHeadsInDepartment({
    department: newDepartment,
    complaintId,
    type: "reassigned_to_department",
    title: "Complaint Reassigned To Your Department",
    message: `Complaint #${shortId} was reassigned from ${oldDepartment} to ${newDepartment}.`,
    status: complaint.status || "Pending",
    category: complaint.category,
    department: newDepartment,
    locationText: complaint.location_text,
    excludeDepartmentHeadId,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: newDepartment,
      old_assigned_office: oldDepartment,
      new_assigned_office: newDepartment,
      location_text: complaint.location_text,
    },
  });
}

/**
 * Notifies assigned department head(s) when an administrator marks a complaint
 * as completed. Sends an in-app notification and push message acknowledging
 * their contribution to the resolution.
 */
export async function notifyDepartmentHeadsComplaintCompleted({
  complaint,
  department,
}) {
  const complaintId = complaint.rawId || complaint.id;
  const shortId = getComplaintLabel(complaint);
  const assignedOffice =
    department ||
    complaint.department ||
    complaint.assigned_office ||
    complaint.assignedOffice;

  if (!assignedOffice || assignedOffice === "Unassigned") {
    console.log(
      "Skip department head completion acknowledgment: missing assigned office."
    );
    return { success: false, notifiedCount: 0, results: [] };
  }

  return notifyDepartmentHeadsInDepartment({
    department: assignedOffice,
    complaintId,
    type: "completed_by_admin",
    title: "Complaint Completed — Thank You",
    message: `Complaint #${shortId} has been marked as completed by the City Administrator. Thank you for your dedication and timely response in resolving this concern for the community.`,
    status: "Completed",
    category: complaint.category,
    department: assignedOffice,
    locationText:
      complaint.location_text || complaint.geotaggedLocation || complaint.location,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: assignedOffice,
      location_text:
        complaint.location_text || complaint.geotaggedLocation || complaint.location,
      new_status: "Completed",
      acknowledgment_type: "completion_thank_you",
    },
  });
}

export async function notifyDepartmentHeadsReturnedForWork({
  complaint,
  department,
  reason,
}) {
  const complaintId = complaint.rawId || complaint.id;
  const shortId = getComplaintLabel(complaint);
  const assignedOffice =
    department ||
    complaint.department ||
    complaint.assigned_office ||
    complaint.assignedOffice;
  const returnReason = String(reason || "").trim();

  if (!assignedOffice || assignedOffice === "Unassigned") {
    console.log(
      "Skip department head return notice: missing assigned office."
    );
    return { success: false, notifiedCount: 0, results: [] };
  }

  const message = returnReason
    ? `Complaint #${shortId} was returned by the admin. AI reason: ${returnReason}`
    : `Complaint #${shortId} was returned by the admin. Continue work and mark it For Validation when done.`;

  return notifyDepartmentHeadsInDepartment({
    department: assignedOffice,
    complaintId,
    type: "returned",
    title: "Complaint Returned for Further Action",
    message,
    status: "In Progress",
    category: complaint.category,
    locationText:
      complaint.location_text || complaint.geotaggedLocation || complaint.location,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: assignedOffice,
      old_status: "For Validation",
      new_status: "In Progress",
      return_reason: returnReason,
      ai_validation_summary: complaint.aiValidationSummary || null,
      ai_validation_reason: complaint.aiValidationReason || null,
      ai_validation_status: complaint.aiValidationStatus || null,
      citizen_validation_answer: complaint.validationAnswer || null,
      citizen_feedback: complaint.feedback || null,
      open_details: true,
    },
  });
}

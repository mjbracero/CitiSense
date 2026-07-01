import { sendRolePushNotification } from "./notificationPush";
import { supabase } from "./supabase";

function getComplaintLabel(complaint = {}) {
  return (
    complaint.short_id ||
    complaint.shortId ||
    complaint.id ||
    (complaint.rawId ? String(complaint.rawId).slice(0, 8) : "N/A")
  );
}

export async function getAdminIds() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
    console.log("Load admin profiles error:", error);
    return [];
  }

  return (data || []).map((profile) => profile.id).filter(Boolean);
}

export async function getProfileDisplayName(userId) {
  if (!userId) {
    return "Citizen";
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.full_name) {
    return "Citizen";
  }

  return data.full_name;
}

export async function createAdminNotificationAndPush({
  adminId,
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
  if (!adminId || !complaintId) {
    return {
      success: false,
      error: new Error("Missing admin or complaint id."),
    };
  }

  const { data, error } = await supabase
    .from("admin_notifications")
    .insert({
      admin_id: adminId,
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
    .select("id, admin_id, complaint_id, title, message")
    .single();

  if (error) {
    console.log("Create admin notification error:", error);
    return { success: false, error };
  }

  const pushResult = await sendRolePushNotification({
    userId: adminId,
    title,
    body: message,
    role: "admin",
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

export async function notifyAllAdmins({
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
  const adminIds = await getAdminIds();

  if (adminIds.length === 0) {
    return { success: true, notifiedCount: 0, results: [] };
  }

  const results = [];

  for (const adminId of adminIds) {
    results.push(
      await createAdminNotificationAndPush({
        adminId,
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

export async function notifyAdminsNewComplaint({
  complaint,
  citizenName = "Citizen",
}) {
  const complaintId = complaint.id;
  const shortId = getComplaintLabel(complaint);
  const department = complaint.assigned_office || "Unassigned";

  return notifyAllAdmins({
    complaintId,
    type: "new_complaint",
    title: "New Complaint Submitted",
    message: `${citizenName} submitted complaint #${shortId} for ${department}.`,
    status: complaint.status || "Pending",
    category: complaint.category,
    department,
    locationText: complaint.location_text,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: department,
      location_text: complaint.location_text,
      citizen_name: citizenName,
      new_status: complaint.status || "Pending",
    },
  });
}

export async function notifyAdminsValidationRequired({ complaint }) {
  const complaintId = complaint.id || complaint.rawId;
  const shortId = getComplaintLabel(complaint);
  const department = complaint.assigned_office || complaint.department || "Unassigned";

  return notifyAllAdmins({
    complaintId,
    type: "for_validation",
    title: "Citizen Validation Required",
    message: `Complaint #${shortId} is ready for citizen validation in ${department}.`,
    status: "For Validation",
    category: complaint.category,
    department,
    locationText: complaint.location_text,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: department,
      location_text: complaint.location_text,
      new_status: "For Validation",
    },
  });
}

export async function notifyAdminsCitizenValidated({
  complaint,
  validationAnswer,
  citizenName = "Citizen",
}) {
  const complaintId = complaint.id || complaint.rawId;
  const shortId = getComplaintLabel(complaint);
  const department = complaint.assigned_office || complaint.department || "Unassigned";
  const resolved = validationAnswer === "resolved";

  return notifyAllAdmins({
    complaintId,
    type: "final_confirmation",
    title: "Citizen Validation Submitted",
    message: resolved
      ? `${citizenName} validated complaint #${shortId} as resolved. Review and approve completion.`
      : `${citizenName} reported complaint #${shortId} as unresolved. Review and decide next action.`,
    status: "For Validation",
    category: complaint.category,
    department,
    locationText: complaint.location_text,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: department,
      location_text: complaint.location_text,
      citizen_name: citizenName,
      validation_answer: validationAnswer,
      new_status: "For Validation",
    },
  });
}

export async function notifyAdminsReassignment({
  complaint,
  oldDepartment,
  newDepartment,
  reason,
}) {
  const complaintId = complaint.id || complaint.rawId;
  const shortId = getComplaintLabel(complaint);

  return notifyAllAdmins({
    complaintId,
    type: "reassigned_to_department",
    title: "Complaint Reassigned",
    message: `Complaint #${shortId} was reassigned from ${oldDepartment} to ${newDepartment}.`,
    status: complaint.status || "Pending",
    category: complaint.category,
    department: newDepartment,
    locationText: complaint.location_text,
    metadata: {
      short_id: shortId,
      complaint_title: complaint.title,
      title: complaint.title,
      category: complaint.category,
      assigned_office: newDepartment,
      old_assigned_office: oldDepartment,
      new_assigned_office: newDepartment,
      reassignment_reason: reason || null,
      location_text: complaint.location_text,
    },
  });
}

import { sendRolePushNotification } from "./notificationPush";
import { supabase } from "./supabase";

function getComplaintLabel(complaint = {}) {
  return (
    complaint.short_id ||
    complaint.shortId ||
    (complaint.id ? String(complaint.id).slice(0, 8) : "N/A")
  );
}

export async function getDepartmentHeadIdsByDepartment(department) {
  const cleanDepartment = String(department || "").trim();

  if (!cleanDepartment) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "moderator")
    .eq("department", cleanDepartment);

  if (error) {
    console.log("Load department heads by department error:", error);
    return [];
  }

  return (data || []).map((profile) => profile.id).filter(Boolean);
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

  return notifyDepartmentHeadsInDepartment({
    department: assignedOffice,
    complaintId,
    type: "new_assignment",
    title: "New Complaint Assigned",
    message: `Complaint #${shortId} was assigned to ${assignedOffice}.`,
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
      reassignment_reason: reason || null,
      location_text: complaint.location_text,
    },
  });
}

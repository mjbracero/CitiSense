import { sendRolePushNotification } from "./notificationPush";
import { supabase } from "./supabase";

export async function createCitizenNotificationAndPush({
  citizenId,
  complaintId,
  shortId,
  type = "status",
  title,
  message,
  status,
  metadata = {},
}) {
  if (!citizenId || !complaintId) {
    return {
      success: false,
      error: new Error("Missing citizen or complaint id."),
    };
  }

  const { data, error } = await supabase
    .from("complaint_notifications")
    .insert({
      citizen_id: citizenId,
      complaint_id: complaintId,
      type,
      title,
      message,
      status,
      is_read: false,
      metadata: {
        short_id: shortId,
        ...metadata,
      },
    })
    .select("id, citizen_id, complaint_id, title, message")
    .single();

  if (error) {
    console.log("Create citizen notification error:", error);
    return { success: false, error };
  }

  try {
    const pushResult = await sendRolePushNotification({
      userId: citizenId,
      title: title || "Complaint Update",
      body: message || "Your complaint has a new update.",
      role: "citizen",
      complaintId,
      notificationId: data.id,
    });

    if (!pushResult.pushSent) {
      return {
        success: true,
        notification: data,
        pushSent: false,
        pushError: pushResult.pushError,
      };
    }

    return { success: true, notification: data, pushSent: true };
  } catch (pushError) {
    console.log("Citizen push invoke catch:", pushError);
    return { success: true, notification: data, pushSent: false, pushError };
  }
}

export async function notifyCitizenComplaintStatusChange({
  citizenId,
  complaintId,
  shortId,
  oldStatus,
  newStatus,
  updatedBy,
  department,
  category,
  title: complaintTitle,
}) {
  const notificationTitle = "Complaint Status Updated";
  const notificationMessage = `Your complaint #${shortId} status changed from ${oldStatus} to ${newStatus}.`;

  return createCitizenNotificationAndPush({
    citizenId,
    complaintId,
    shortId,
    type: "status",
    title: notificationTitle,
    message: notificationMessage,
    status: newStatus,
    metadata: {
      old_status: oldStatus,
      new_status: newStatus,
      updated_by: updatedBy || null,
      assigned_office: department || null,
      title: complaintTitle || null,
      category: category || null,
    },
  });
}

import { canCitizenSubmitValidation } from "./complaintFeedbackService";
import { supabase } from "./supabase";

let lastReminderCheckAt = 0;
const REMINDER_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export async function requestCitizenValidationReminders(citizenId) {
  if (!citizenId) {
    return { sent: 0 };
  }

  const now = Date.now();
  if (now - lastReminderCheckAt < REMINDER_CHECK_COOLDOWN_MS) {
    return { sent: 0, skipped: true };
  }

  lastReminderCheckAt = now;

  try {
    const { data, error } = await supabase.rpc(
      "send_validation_reminders_for_citizen",
      { p_citizen_id: citizenId }
    );

    if (error) {
      console.log("Citizen validation reminder RPC error:", error);
      return { sent: 0, error };
    }

    return { sent: Number(data) || 0 };
  } catch (error) {
    console.log("Citizen validation reminder request error:", error);
    return { sent: 0, error };
  }
}

export function countPendingValidationComplaints(complaints = []) {
  return complaints.filter((complaint) => canCitizenSubmitValidation(complaint))
    .length;
}

export function getPendingValidationComplaints(complaints = []) {
  return complaints.filter((complaint) => canCitizenSubmitValidation(complaint));
}

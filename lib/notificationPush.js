import { supabase } from "./supabase";

const ROLE_ROUTES = {
  citizen: "/citizen/notification",
  departmentHead: "/departmentHead/notification",
  admin: "/admin/notification",
};

export async function sendRolePushNotification({
  userId,
  title,
  body,
  role,
  complaintId,
  notificationId,
}) {
  if (!userId) {
    return { pushSent: false };
  }

  try {
    const { data: pushData, error: pushError } = await supabase.functions.invoke(
      "send-push-notification",
      {
        body: {
          user_id: userId,
          title: title || "CitiSense Update",
          body: body || "You have a new notification.",
          data: {
            role,
            route: ROLE_ROUTES[role] || ROLE_ROUTES.citizen,
            complaint_id: complaintId ? String(complaintId) : "",
            notification_id: notificationId ? String(notificationId) : "",
          },
        },
      }
    );

    if (pushError) {
      let errorDetails = pushData;

      if (!errorDetails && pushError?.context?.json) {
        try {
          errorDetails = await pushError.context.json();
        } catch {
          // Ignore JSON parse errors from the edge function response.
        }
      }

      console.log(`${role} push invoke error:`, pushError.message || pushError);
      console.log(`${role} push invoke response:`, errorDetails);
      return { pushSent: false, pushError: errorDetails || pushError };
    }

    const sentCount = pushData?.sent ?? 0;

    if (sentCount === 0) {
      console.log(`${role} push not sent:`, pushData);
      return { pushSent: false, pushError: pushData };
    }

    return { pushSent: true };
  } catch (pushError) {
    console.log(`${role} push invoke catch:`, pushError);
    return { pushSent: false, pushError };
  }
}

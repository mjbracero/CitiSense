import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

function mapWebhookToPush(payload: WebhookPayload) {
  const record = payload.record || {};

  if (payload.table === "complaint_notifications") {
    return {
      user_id: String(record.citizen_id || ""),
      title: String(record.title || "Complaint Update"),
      body: String(record.message || "Your complaint has a new update."),
      data: {
        role: "citizen",
        route: "/citizen/notification",
        complaint_id: String(record.complaint_id || ""),
        notification_id: String(record.id || ""),
      },
    };
  }

  if (payload.table === "admin_notifications") {
    return {
      user_id: String(record.admin_id || ""),
      title: String(record.title || "Admin Notification"),
      body: String(record.message || "There is a new admin update."),
      data: {
        role: "admin",
        route: "/admin/notification",
        complaint_id: String(record.complaint_id || ""),
        notification_id: String(record.id || ""),
      },
    };
  }

  if (payload.table === "moderator_notifications") {
    return {
      user_id: String(record.moderator_id || ""),
      title: String(record.title || "Department Head Notification"),
      body: String(record.message || "You have a new department head update."),
      data: {
        role: "departmentHead",
        route: "/departmentHead/notification",
        complaint_id: String(record.complaint_id || ""),
        notification_id: String(record.id || ""),
      },
    };
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const payload = (await request.json()) as WebhookPayload;
    const pushPayload = mapWebhookToPush(payload);

    if (!pushPayload?.user_id) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "Unsupported webhook payload." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-push-notification`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pushPayload),
      }
    );

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("dispatch-notification-push error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

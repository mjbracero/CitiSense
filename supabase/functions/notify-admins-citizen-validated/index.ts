import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotifyRequest = {
  complaintId?: string;
  validationAnswer?: string;
  citizenName?: string;
  type?: string;
  title?: string;
  message?: string;
  status?: string;
  category?: string;
  department?: string;
  locationText?: string;
  metadata?: Record<string, unknown>;
};

async function insertAdminNotifications(
  adminClient: ReturnType<typeof createClient>,
  adminIds: string[],
  complaintId: string,
  type: string,
  title: string,
  message: string,
  status: string | null,
  category: string | null,
  department: string | null,
  locationText: string | null,
  metadata: Record<string, unknown>
) {
  const results = [];

  for (const adminId of adminIds) {
    const { data: recentRows } = await adminClient
      .from("admin_notifications")
      .select("id")
      .eq("admin_id", adminId)
      .eq("complaint_id", complaintId)
      .eq("type", type)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString())
      .limit(1);

    if (recentRows?.length) {
      results.push({ success: true, skipped: true, adminId });
      continue;
    }

    const { data, error } = await adminClient
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

    results.push({
      success: !error,
      adminId,
      notification: data,
      error: error?.message || null,
    });
  }

  return results;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await request.json()) as NotifyRequest;
    const complaintId = String(body.complaintId || "").trim();

    if (!complaintId) {
      return new Response(JSON.stringify({ error: "Missing complaint id." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: admins, error: adminsError } = await adminClient
      .from("profiles")
      .select("id")
      .in("role", ["admin", "Admin"]);

    if (adminsError) {
      throw adminsError;
    }

    const adminIds = (admins || []).map((profile) => profile.id).filter(Boolean);

    if (adminIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notifiedCount: 0, results: [] }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validationAnswer = String(body.validationAnswer || "").trim();
    const isCitizenValidation = Boolean(validationAnswer);

    let type = String(body.type || "system_update").trim();
    let title = String(body.title || "Admin Notification").trim();
    let message = String(body.message || "There is a new admin update.").trim();
    let status = body.status || null;
    let category = body.category || null;
    let department = body.department || null;
    let locationText = body.locationText || null;
    let metadata = body.metadata || {};

    if (isCitizenValidation) {
      const citizenName =
        String(body.citizenName || "Citizen").trim() || "Citizen";

      const { data: complaint, error: complaintError } = await adminClient
        .from("complaints")
        .select(
          "id, short_id, title, category, assigned_office, location_text, status, citizen_id, citizen_validated_at"
        )
        .eq("id", complaintId)
        .maybeSingle();

      if (complaintError || !complaint) {
        return new Response(JSON.stringify({ error: "Complaint not found." }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (complaint.citizen_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!complaint.citizen_validated_at) {
        return new Response(
          JSON.stringify({ error: "Complaint validation not submitted yet." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const shortId = complaint.short_id || String(complaint.id).slice(0, 8);
      department = complaint.assigned_office || "Unassigned";
      const resolved = validationAnswer === "resolved";
      type = "citizen_validation";
      title = "Citizen Validation Submitted";
      message = resolved
        ? `${citizenName} validated complaint #${shortId} as resolved. Review and approve completion.`
        : `${citizenName} reported complaint #${shortId} as unresolved. Review and decide next action.`;
      status = complaint.status || "For Validation";
      category = complaint.category;
      locationText = complaint.location_text;
      metadata = {
        short_id: shortId,
        complaint_title: complaint.title,
        title: complaint.title,
        category: complaint.category,
        assigned_office: department,
        location_text: complaint.location_text,
        citizen_name: citizenName,
        validation_answer: validationAnswer,
        new_status: complaint.status || "For Validation",
        open_details: true,
      };
    }

    const results = await insertAdminNotifications(
      adminClient,
      adminIds,
      complaintId,
      type,
      title,
      message,
      status,
      category,
      department,
      locationText,
      metadata
    );

    const notifiedCount = results.filter((result) => result.success).length;

    return new Response(
      JSON.stringify({
        success: notifiedCount > 0 || results.some((result) => result.skipped),
        notifiedCount,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("notify-admins-citizen-validated error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

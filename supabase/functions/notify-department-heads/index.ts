import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotifyDepartmentHeadsRequest = {
  department?: string;
  complaintId?: string;
  type?: string;
  title?: string;
  message?: string;
  status?: string;
  category?: string;
  locationText?: string;
  metadata?: Record<string, unknown>;
  excludeDepartmentHeadId?: string | null;
};

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

    const body = (await request.json()) as NotifyDepartmentHeadsRequest;
    const department = String(body.department || "").trim();
    const complaintId = String(body.complaintId || "").trim();
    const type = String(body.type || "system_update").trim();
    const title = String(body.title || "Department Head Notification").trim();
    const message = String(body.message || "There is a new department update.").trim();
    const excludeDepartmentHeadId = body.excludeDepartmentHeadId || null;

    if (!department || !complaintId) {
      return new Response(
        JSON.stringify({ error: "Missing department or complaint id." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: departmentHeads, error: departmentHeadsError } =
      await adminClient
        .from("profiles")
        .select("id")
        .eq("role", "moderator")
        .eq("department", department);

    if (departmentHeadsError) {
      throw departmentHeadsError;
    }

    const departmentHeadIds = (departmentHeads || [])
      .map((profile) => profile.id)
      .filter((id) => id && id !== excludeDepartmentHeadId);

    if (departmentHeadIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notifiedCount: 0, results: [] }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const results = [];

    for (const departmentHeadId of departmentHeadIds) {
      const { data: recentRows } = await adminClient
        .from("moderator_notifications")
        .select("id")
        .eq("moderator_id", departmentHeadId)
        .eq("complaint_id", complaintId)
        .eq("type", type)
        .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString())
        .limit(1);

      if (recentRows?.length) {
        results.push({ success: true, skipped: true, departmentHeadId });
        continue;
      }

      const { data, error } = await adminClient
        .from("moderator_notifications")
        .insert({
          moderator_id: departmentHeadId,
          complaint_id: complaintId,
          type,
          title,
          message,
          status: body.status || null,
          category: body.category || null,
          department,
          location_text: body.locationText || null,
          is_read: false,
          metadata: body.metadata || {},
        })
        .select("id, moderator_id, complaint_id, title, message")
        .single();

      results.push({
        success: !error,
        departmentHeadId,
        notification: data,
        error: error?.message || null,
      });
    }

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
    console.error("notify-department-heads error:", error);

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

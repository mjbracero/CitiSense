import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type PushPayload = {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isExpoPushToken(token: string) {
  return (
    token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
  );
}

async function getFirebaseAccessToken() {
  const clientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL")?.trim();
  const privateKey = Deno.env
    .get("FIREBASE_PRIVATE_KEY")
    ?.replace(/\\n/g, "\n")
    .replace(/^"|"$/g, "")
    .trim();

  if (!clientEmail || !privateKey) {
    throw new Error("Missing Firebase service account secrets.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const unsignedToken = `${header}.${claimSet}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsignedToken)
  );

  const signedJwt = `${unsignedToken}.${base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedJwt,
    }),
  });

  const tokenJson = await tokenResponse.json();

  if (!tokenResponse.ok) {
    throw new Error(
      tokenJson.error_description || "Unable to get Firebase access token."
    );
  }

  return tokenJson.access_token as string;
}

function pemToArrayBuffer(pem: string) {
  const cleaned = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function sendExpoPushMessage(
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      ttl: 86400,
      data,
    }),
  });

  const responseJson = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(responseJson));
  }

  const tickets = Array.isArray(responseJson?.data)
    ? responseJson.data
    : [responseJson?.data].filter(Boolean);

  const errors = tickets.filter((ticket) => ticket?.status === "error");

  if (errors.length > 0) {
    throw new Error(JSON.stringify(errors));
  }

  return responseJson;
}

/**
 * Closed-app Android banners require a top-level `notification` block so the
 * OS can show a tray/heads-up alert when the app process is not running.
 *
 * Intentionally omit android.notification.channel_id: if the app's "default"
 * channel was muted/created wrong, FCM still returns success but nothing shows.
 * Without channel_id, Android posts to the system Miscellaneous channel instead.
 */
async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
) {
  const stringData: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value == null) continue;
    stringData[key] = String(value);
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title,
            body,
          },
          // Keep data tiny — only routing keys — so OEMs treat this as a
          // display notification, not a silent data message.
          data: stringData,
          android: {
            priority: "HIGH",
            ttl: "86400s",
            notification: {
              sound: "default",
              default_sound: true,
              default_vibrate_timings: true,
              notification_priority: "PRIORITY_MAX",
              visibility: "PUBLIC",
            },
          },
        },
      }),
    }
  );

  const responseText = await response.text();
  let responseJson: Record<string, unknown> = {};

  try {
    responseJson = responseText ? JSON.parse(responseText) : {};
  } catch {
    responseJson = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(responseText || "FCM send failed.");
  }

  return responseJson;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID");

    if (!supabaseUrl || !serviceRoleKey || !firebaseProjectId) {
      throw new Error("Missing Supabase or Firebase environment variables.");
    }

    const payload = (await request.json()) as PushPayload;

    if (!payload?.user_id || !payload?.title || !payload?.body) {
      return new Response(
        JSON.stringify({ error: "user_id, title, and body are required." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: tokens, error } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", payload.user_id)
      .eq("is_active", true);

    if (error) {
      throw error;
    }

    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ sent: 0, message: "No active push tokens." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = payload.data || {};
    let sent = 0;
    const results: Array<Record<string, unknown>> = [];
    let firebaseAccessToken: string | null = null;

    for (const row of tokens) {
      try {
        if (isExpoPushToken(row.token)) {
          const expoResult = await sendExpoPushMessage(
            row.token,
            payload.title,
            payload.body,
            data
          );
          sent += 1;
          results.push({
            ok: true,
            via: "expo",
            token_len: row.token?.length || 0,
            expo: expoResult,
          });
          continue;
        }

        if (!firebaseAccessToken) {
          firebaseAccessToken = await getFirebaseAccessToken();
        }

        const fcmResult = await sendFcmMessage(
          firebaseAccessToken,
          firebaseProjectId,
          row.token,
          payload.title,
          payload.body,
          data
        );
        sent += 1;
        results.push({
          ok: true,
          via: "fcm",
          token_len: row.token?.length || 0,
          fcm_name: fcmResult?.name || null,
        });
      } catch (sendError) {
        const message =
          sendError instanceof Error ? sendError.message : String(sendError);
        console.error("Push send error:", sendError);
        results.push({
          ok: false,
          via: isExpoPushToken(row.token) ? "expo" : "fcm",
          token_len: row.token?.length || 0,
          error: message.slice(0, 500),
        });
      }
    }

    return new Response(
      JSON.stringify({
        sent,
        firebase_project_id: firebaseProjectId,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("send-push-notification error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

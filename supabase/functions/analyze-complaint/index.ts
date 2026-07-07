import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

const PHILIPPINE_LANGUAGE_INSTRUCTION = `Understand and classify complaints written in any Philippine language or mix of languages, including English, Tagalog, Cebuano/Bisaya, Waray, Ilocano, Hiligaynon/Ilonggo, Kapampangan, Bicolano, Chavacano, and Taglish. Interpret meaning across languages — do not rely on English keywords alone.`;

const MODERATION_PROMPT_RULES = `Content moderation rules (must enforce before any other analysis):
- CitiSense only accepts legitimate Bogo City LGU public-service complaints.
- Reject complaints with profanity, insults, slurs, harsh language, or abusive wording in any Philippine language.
- Reject joke reports, pranks, trippings, fake/test complaints, personal relationship drama, gossip, or concerns outside LGU scope.
- Valid complaints involve public roads, utilities, safety, health, sanitation, environment, infrastructure, disasters, traffic, city facilities, or similar LGU services in Bogo City.
- If rejected, set moderation.is_allowed to false and do not classify the complaint.
- Provide a polite moderation.user_message explaining why the report was rejected.`;

const DEPARTMENT_BY_CATEGORY: Record<string, string> = {
  "Water Concerns": "Bogo Water District",
  "Electricity Concerns": "CEBECO II",
  "Streetlight Concerns": "City Engineering Office",
  "Road and Infrastructure Concerns": "City Engineering Office",
  "Drainage and Flooding Concerns": "City Engineering Office",
  "Waste and Environmental Concerns": "CENRO",
  "Traffic and Road Safety Concerns": "BTMO",
  "Transport Terminal Concerns": "Bogo City Central Bus Terminal Office",
  "Port Concerns": "Polambato Port Office",
  "Health and Sanitation Concerns": "City Health Office",
  "Animal Concerns": "City Veterinary Office",
  "Building and Construction Concerns": "Office of the Building Official",
  "Planning and Zoning Concerns":
    "City Planning and Development Office / Zoning Office",
  "Public Market Concerns": "Bogo Public Market Office",
  "Public Plaza Concerns": "Bogo Public Plaza Office",
  "City Facility Concerns": "General Services Office",
  "Tourism Site / Public Attraction Concerns": "City Tourism Office",
  "Disaster and Emergency Concerns": "CDRRMO",
  "Fire Safety Concerns": "BFP Bogo City Fire Station",
  "Peace and Order Concerns": "Bogo City Police Station / PNP",
  "Coastal and Marine Protection Concerns": "Bantay Dagat",
  "PWD Accessibility Concerns": "PDAO",
};

const COMPLAINT_CATEGORY_NAMES = Object.keys(DEPARTMENT_BY_CATEGORY);

type PhotoPayload = {
  mime_type?: string;
  data: string;
};

type AnalyzeComplaintRequest = {
  title?: string;
  description?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  isEmergency?: boolean;
  photoImages?: PhotoPayload[];
  existingComplaints?: Array<Record<string, unknown>>;
  nearbyComplaints?: Array<Record<string, unknown>>;
  clusterInfo?: Record<string, unknown> | null;
};

function buildAnalysisPrompt(body: AnalyzeComplaintRequest) {
  const title = body.title || "";
  const description = body.description || "";
  const locationText = body.locationText || "Not provided";
  const latitude = body.latitude;
  const longitude = body.longitude;
  const isEmergency = Boolean(body.isEmergency);
  const hasPhotos =
    Array.isArray(body.photoImages) && body.photoImages.length > 0;
  const existingComplaints = body.existingComplaints || [];
  const nearbyComplaints = body.nearbyComplaints || [];
  const clusterSummary =
    (body.clusterInfo?.summary as string) ||
    "Cluster analysis uses nearby complaint frequency around the pinned location.";

  const complaintList =
    existingComplaints.length > 0
      ? existingComplaints
          .map(
            (item, index) =>
              `${index + 1}. ID: ${item.id}\nTitle: ${item.title}\nDescription: ${item.description || "N/A"}\nCategory: ${item.category || "Unclassified"}\nLocation: ${item.location_text || "N/A"}\nStatus: ${item.status || "Pending"}`
          )
          .join("\n\n")
      : "No active complaints from this citizen.";

  const nearbyList =
    nearbyComplaints.length > 0
      ? nearbyComplaints
          .slice(0, 10)
          .map(
            (item, index) =>
              `${index + 1}. ID: ${item.id}\nTitle: ${item.title}\nCategory: ${item.category || "Unclassified"}\nStatus: ${item.status || "Pending"}\nDistance: ${item.distance_km ?? "unknown"} km`
          )
          .join("\n\n")
      : "No other active complaints were found near this location.";

  return `You are an AI assistant for CitiSense, a Bogo City, Cebu LGU complaint management system in the Philippines.

Analyze the complaint using NLP for category classification, urgency and severity assessment, duplicate detection, computer vision for photo relevance, and nearby complaint cluster review.

${PHILIPPINE_LANGUAGE_INSTRUCTION}

${MODERATION_PROMPT_RULES}

Return ONLY valid JSON with this exact shape:
{
  "category": "one exact category from the allowed list",
  "priority": "Critical | High | Normal | Low",
  "is_emergency": boolean,
  "confidence": number between 0 and 1,
  "reasoning": "short explanation",
  "moderation": {
    "is_allowed": boolean,
    "contains_profanity": boolean,
    "is_out_of_scope": boolean,
    "block_reason": "profanity | out_of_scope | both | null",
    "user_message": "polite explanation for the citizen, or null when allowed"
  },
  "urgency_analysis": {
    "is_emergency": boolean,
    "complaint_type": "Emergency | Non-Emergency",
    "priority": "Critical | High | Normal | Low",
    "severity_score": number between 0 and 1,
    "urgency_reason": "explain urgency and severity from the complaint text"
  },
  "duplicate": {
    "is_duplicate": boolean,
    "similar_complaint_id": "uuid or null",
    "similarity_score": number between 0 and 1,
    "reason": "short explanation"
  },
  "cluster_analysis": {
    "confirm_cluster": boolean,
    "priority_impact": "explain whether nearby similar reports increase urgency"
  },
  "image_analysis": {
    "is_relevant": boolean,
    "relevance_score": number between 0 and 1,
    "detected_subject": "what the photo actually shows",
    "summary": "explain whether the photo supports the complaint",
    "mismatch_reason": "why the photo does not match, or null when relevant"
  }
}

Allowed categories (use exact spelling):
${COMPLAINT_CATEGORY_NAMES.join("\n")}

Urgency and priority rules:
- Distinguish Emergency vs Non-Emergency complaints using urgency_analysis.complaint_type.
- Assign Critical priority to emergencies and severe immediate-risk issues.
- Assign High, Normal, or Low based on urgency and severity of the described concern.

Cluster rules:
- Review nearby active complaints around the same location.
- confirm_cluster should be true when multiple similar reports in the same area suggest a recurring local issue.

CRITICAL image relevance rules (computer vision):
1. Inspect every attached photo before answering image_analysis.
2. Compare the photo content against BOTH the complaint title and description together.
3. Set image_analysis.is_relevant to false when the photo shows a different subject than the complaint.

New complaint:
Title: ${title}
Description: ${description}
Location: ${locationText}
Coordinates: ${typeof latitude === "number" && typeof longitude === "number" ? `${latitude}, ${longitude}` : "Not provided"}
Marked emergency by citizen: ${isEmergency ? "yes" : "no"}
Photos attached: ${hasPhotos ? "yes — analyze the attached image(s) below" : "no"}
Nearby cluster signal: ${clusterSummary}

Existing active complaints from this citizen:
${complaintList}

Nearby active complaints from other citizens:
${nearbyList}`;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function parseGeminiHttpResponse(response: Response) {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error("Gemini API returned an empty response.");
  }

  if (trimmed.startsWith("<")) {
    throw new Error(
      "Gemini API returned HTML instead of JSON. Verify GEMINI_API_KEY and model access."
    );
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error(`Gemini API returned invalid JSON: ${trimmed.slice(0, 180)}`);
  }

  if (!response.ok) {
    throw new Error(
      (payload?.error as { message?: string })?.message ||
        `Gemini API request failed with status ${response.status}.`
    );
  }

  return payload;
}

async function callGemini(
  prompt: string,
  photoImages: PhotoPayload[] = []
) {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY secret.");
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_MODEL;
  const endpoint = `${GEMINI_BASE_URL}/models/${model}:generateContent`;

  const parts: Array<Record<string, unknown>> = [{ text: prompt }];

  for (const photo of photoImages.slice(0, 2)) {
    if (!photo?.data) continue;

    parts.push({
      inline_data: {
        mime_type: photo.mime_type || "image/jpeg",
        data: photo.data,
      },
    });
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = await parseGeminiHttpResponse(response);

  const responseText = (payload?.candidates as Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>)?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");

  const parsed = extractJsonObject(responseText || "");

  if (!parsed) {
    throw new Error("Gemini returned an unreadable analysis response.");
  }

  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as AnalyzeComplaintRequest;
    const prompt = buildAnalysisPrompt(body);
    const photoImages = Array.isArray(body.photoImages) ? body.photoImages : [];
    const analysis = await callGemini(prompt, photoImages);

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

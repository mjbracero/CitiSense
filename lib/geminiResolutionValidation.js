import * as FileSystem from "expo-file-system/legacy";
import {
  callGeminiGenerate,
  extractJsonObject,
  getGeminiApiKey,
} from "./geminiApi";
import {
  PHILIPPINE_LANGUAGE_INSTRUCTION,
  preparePhotoForGemini,
} from "./geminiComplaintAnalysis";

/**
 * AI checks citizen validation evidence against the original complaint
 * before an admin may mark the complaint completed.
 */

function clamp01(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

async function downloadRemotePhotoToCache(url) {
  if (!url || !/^https?:\/\//i.test(String(url))) {
    return null;
  }

  try {
    const target = `${FileSystem.cacheDirectory}ai-validation-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`;
    const downloaded = await FileSystem.downloadAsync(String(url), target);
    return downloaded?.uri || null;
  } catch (error) {
    console.log("Download remote photo for AI validation error:", error);
    return null;
  }
}

async function prepareAnyPhotoForGemini(uriOrUrl) {
  if (!uriOrUrl) return null;

  const value = String(uriOrUrl);
  let localUri = value;

  if (/^https?:\/\//i.test(value)) {
    localUri = await downloadRemotePhotoToCache(value);
  }

  if (!localUri) return null;
  return preparePhotoForGemini(localUri);
}

export function buildResolutionValidationPrompt({
  title,
  description,
  category,
  locationText,
  citizenAnswer,
  citizenFeedback,
  hasOriginalPhotos,
  hasValidationPhotos,
}) {
  const answerLabel =
    citizenAnswer === "resolved" || citizenAnswer === "yes"
      ? "Citizen claims the issue WAS RESOLVED"
      : citizenAnswer === "not_resolved" || citizenAnswer === "no"
        ? "Citizen claims the issue was NOT RESOLVED"
        : `Citizen answer: ${citizenAnswer || "unknown"}`;

  return `You are an AI validation guide for CitiSense (Bogo City, Cebu LGU complaint system).

Your role is advisory only. A human admin makes the final decision to mark complete or return the complaint. Provide clear guidance based on the evidence.

${PHILIPPINE_LANGUAGE_INSTRUCTION}

Complaint:
- Title: ${title || "N/A"}
- Description: ${description || "N/A"}
- Category: ${category || "Unclassified"}
- Location: ${locationText || "N/A"}

Citizen validation:
- ${answerLabel}
- Feedback: ${citizenFeedback || "N/A"}
- Original complaint photos provided: ${hasOriginalPhotos ? "yes" : "no"}
- Citizen validation photos provided: ${hasValidationPhotos ? "yes" : "no"}

Photo order in this request:
1) First images = ORIGINAL complaint evidence (before / problem state), if any
2) Later images = CITIZEN VALIDATION evidence (after / current state)

Assess whether the validation evidence is credible and consistent with the citizen's claim.

Rules:
- If the citizen says RESOLVED: lean approve when validation photos reasonably show the problem appears fixed or improved in a way that matches the complaint.
- If the citizen says NOT RESOLVED: lean approve when validation photos reasonably show the problem is still present / unresolved.
- Prefer "needs_human_review" when evidence is mixed, weak, or uncertain — do not block the admin.
- Reject only when photos are clearly unrelated, blank, contradict the claim, or are insufficient to judge.
- Prefer approval when evidence is reasonably supportive; do not demand perfection.
- Use both text feedback and photos.

Return ONLY valid JSON with this exact shape:
{
  "approved": boolean,
  "status": "approved" | "rejected",
  "confidence": number between 0 and 1,
  "supports_citizen_claim": boolean,
  "evidence_quality": "strong" | "adequate" | "weak" | "insufficient",
  "summary": "short plain-language guidance for the admin",
  "reason": "why you recommend approve, reject, or human review",
  "detected_before": "what original photos show, or null",
  "detected_after": "what validation photos show, or null",
  "recommendation": "mark_complete" | "return_for_review" | "needs_human_review"
}`;
}

export function normalizeResolutionValidation(raw = {}, fallback = {}) {
  const approved =
    typeof raw.approved === "boolean"
      ? raw.approved
      : String(raw.status || "").toLowerCase() === "approved";

  const status = approved ? "approved" : "rejected";
  const recommendationRaw = String(raw.recommendation || "").toLowerCase();
  let recommendation = "needs_human_review";

  if (recommendationRaw.includes("complete") || recommendationRaw === "mark_complete") {
    recommendation = "mark_complete";
  } else if (
    recommendationRaw.includes("return") ||
    recommendationRaw === "return_for_review"
  ) {
    recommendation = "return_for_review";
  } else if (approved && fallback.citizenAnswer === "resolved") {
    recommendation = "mark_complete";
  } else if (!approved || fallback.citizenAnswer === "not_resolved") {
    recommendation = "return_for_review";
  }

  return {
    approved,
    status,
    confidence: clamp01(raw.confidence, approved ? 0.7 : 0.55),
    supports_citizen_claim:
      typeof raw.supports_citizen_claim === "boolean"
        ? raw.supports_citizen_claim
        : approved,
    evidence_quality: ["strong", "adequate", "weak", "insufficient"].includes(
      String(raw.evidence_quality || "").toLowerCase()
    )
      ? String(raw.evidence_quality).toLowerCase()
      : approved
        ? "adequate"
        : "insufficient",
    summary:
      String(raw.summary || "").trim() ||
      (approved
        ? "AI validation approved the citizen evidence."
        : "AI validation rejected the citizen evidence."),
    reason:
      String(raw.reason || "").trim() ||
      "No detailed reason was returned by the AI.",
    detected_before: raw.detected_before
      ? String(raw.detected_before).trim()
      : null,
    detected_after: raw.detected_after
      ? String(raw.detected_after).trim()
      : null,
    recommendation,
    source: "gemini",
    validated_at: new Date().toISOString(),
  };
}

export function buildResolutionValidationDbPayload(result) {
  return {
    ai_validation_status: result.status,
    ai_validation_approved: Boolean(result.approved),
    ai_validation_confidence: result.confidence,
    ai_validation_summary: result.summary,
    ai_validation_reason: result.reason,
    ai_validation_supports_citizen: Boolean(result.supports_citizen_claim),
    ai_validation_recommendation: result.recommendation,
    ai_validation_result: result,
    ai_validated_at: result.validated_at || new Date().toISOString(),
  };
}

export async function validateResolutionWithGemini({
  title,
  description,
  category,
  locationText,
  citizenAnswer,
  citizenFeedback,
  originalPhotoUris = [],
  validationPhotoUris = [],
} = {}) {
  if (!getGeminiApiKey()) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  const originalPhotos = [];
  for (const uri of originalPhotoUris.slice(0, 2)) {
    const prepared = await prepareAnyPhotoForGemini(uri);
    if (prepared) originalPhotos.push(prepared);
  }

  const validationPhotos = [];
  for (const uri of validationPhotoUris.slice(0, 3)) {
    const prepared = await prepareAnyPhotoForGemini(uri);
    if (prepared) validationPhotos.push(prepared);
  }

  const prompt = buildResolutionValidationPrompt({
    title,
    description,
    category,
    locationText,
    citizenAnswer,
    citizenFeedback,
    hasOriginalPhotos: originalPhotos.length > 0,
    hasValidationPhotos: validationPhotos.length > 0,
  });

  const parts = [{ text: prompt }];

  for (const photo of [...originalPhotos, ...validationPhotos]) {
    parts.push({
      inline_data: {
        mime_type: photo.mime_type,
        data: photo.data,
      },
    });
  }

  const responseText = await callGeminiGenerate({
    parts,
    maxOutputTokens: 1200,
    timeoutMs: 28000,
  });
  const parsed = extractJsonObject(responseText);

  if (!parsed) {
    throw new Error("Gemini returned an unreadable resolution validation response.");
  }

  return normalizeResolutionValidation(parsed, { citizenAnswer });
}

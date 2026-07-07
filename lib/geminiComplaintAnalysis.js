import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import {
  COMPLAINT_CATEGORY_NAMES,
  DEPARTMENT_BY_CATEGORY,
  calculatePriorityFromKeywords,
  detectComplaintCategoryFromKeywords,
  getAssignedOffice,
  normalizeComplaintCategory,
} from "./complaintCategories";
import {
  applyClusterPriorityBoost,
  detectEmergencyFromText,
  normalizePriorityLevel,
  resolveComplaintType,
} from "./complaintClusterDetection";
import {
  buildRejectedComplaintAnalysis,
  MODERATION_JSON_SHAPE,
  MODERATION_PROMPT_RULES,
  normalizeAiModerationResult,
} from "./complaintContentModeration";
import {
  callGeminiGenerate,
  extractJsonObject,
  getGeminiApiKey,
} from "./geminiApi";

export const PHILIPPINE_LANGUAGE_INSTRUCTION = `Understand and classify complaints written in any Philippine language or mix of languages, including English, Tagalog, Cebuano/Bisaya, Waray, Ilocano, Hiligaynon/Ilonggo, Kapampangan, Bicolano, Chavacano, and Taglish. Interpret meaning across languages — do not rely on English keywords alone.`;

export function buildAnalysisPrompt({
  title,
  description,
  isEmergency,
  locationText,
  latitude,
  longitude,
  existingComplaints = [],
  nearbyComplaints = [],
  clusterInfo = null,
  hasPhotos,
}) {
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

  const clusterSummary =
    clusterInfo?.summary ||
    "Cluster analysis will be computed from nearby complaint frequency.";

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
  ${MODERATION_JSON_SHAPE}
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

Department routing map:
${Object.entries(DEPARTMENT_BY_CATEGORY)
  .map(([category, office]) => `- ${category} -> ${office}`)
  .join("\n")}

Classification rules:
- Classify into the most specific LGU category based on the full meaning of the title and description in any Philippine language.
- Mark duplicate when title/description/location strongly match an existing active complaint from the same citizen (similarity_score >= 0.75).

Urgency and priority rules:
- Distinguish Emergency vs Non-Emergency complaints using urgency_analysis.complaint_type.
- Set is_emergency and urgency_analysis.is_emergency to true for life-threatening, immediate danger, active fire, drowning, violence, major accidents, structural collapse, or rescue situations.
- Assign Critical priority to emergencies and severe immediate-risk issues.
- Assign High priority to urgent but non-life-threatening issues needing prompt action.
- Assign Normal priority to standard LGU service requests.
- Assign Low priority to minor or cosmetic issues.
- Use urgency_analysis.severity_score to reflect how severe the issue is (1.0 = most severe).
- If the citizen marked the report as emergency, verify whether the text and photo support that classification.

Cluster rules:
- Review nearby active complaints around the same location.
- confirm_cluster should be true when multiple similar reports in the same area suggest a recurring local issue.
- Increase urgency assessment when nearby similar reports indicate a cluster requiring prompt LGU response.

CRITICAL image relevance rules (computer vision):
1. Inspect every attached photo before answering image_analysis.
2. Set image_analysis.detected_subject to what is visually present in the photo.
3. Compare the photo content against BOTH the complaint title and description together.
4. Set image_analysis.is_relevant to true ONLY when the photo visually depicts the issue described in the complaint.
5. Set image_analysis.is_relevant to false when the photo shows a different subject than the complaint.
6. Do NOT mark a photo relevant based on title keywords alone.
7. When is_relevant is false, explain the mismatch in mismatch_reason.
8. If no photos are attached, set is_relevant to null, relevance_score to 0, detected_subject to null, and mismatch_reason to null.

New complaint:
Title: ${title}
Description: ${description}
Location: ${locationText || "Not provided"}
Coordinates: ${typeof latitude === "number" && typeof longitude === "number" ? `${latitude}, ${longitude}` : "Not provided"}
Marked emergency by citizen: ${isEmergency ? "yes" : "no"}
Photos attached: ${hasPhotos ? "yes — analyze the attached image(s) below" : "no"}
Nearby cluster signal: ${clusterSummary}

Existing active complaints from this citizen:
${complaintList}

Nearby active complaints from other citizens:
${nearbyList}`;
}

function normalizeDuplicateResult(duplicate = {}) {
  return {
    is_duplicate: Boolean(duplicate.is_duplicate),
    similar_complaint_id: duplicate.similar_complaint_id || null,
    similarity_score: Number(duplicate.similarity_score) || 0,
    reason: duplicate.reason || "No duplicate analysis available.",
  };
}

export function normalizeImageAnalysis(imageAnalysis = {}, hasPhotos = false) {
  if (!hasPhotos) {
    return {
      is_relevant: null,
      relevance_score: 0,
      detected_subject: null,
      summary: "No photo evidence was attached to this complaint.",
      mismatch_reason: null,
    };
  }

  if (typeof imageAnalysis.is_relevant === "boolean") {
    const isRelevant = imageAnalysis.is_relevant;

    return {
      is_relevant: isRelevant,
      relevance_score:
        Number(imageAnalysis.relevance_score) || (isRelevant ? 0.85 : 0.15),
      detected_subject: imageAnalysis.detected_subject || null,
      summary:
        imageAnalysis.summary ||
        (isRelevant
          ? "Uploaded photo visually supports the complaint."
          : "Uploaded photo does not appear to match the complaint."),
      mismatch_reason: isRelevant
        ? null
        : imageAnalysis.mismatch_reason ||
          "The photo content does not match the reported complaint.",
    };
  }

  return {
    is_relevant: null,
    relevance_score: 0,
    detected_subject: imageAnalysis.detected_subject || null,
    summary:
      "Photo evidence was attached, but visual analysis could not be completed.",
    mismatch_reason: null,
  };
}

export function normalizeGeminiAnalysis(rawAnalysis, fallbackInput = {}) {
  const moderation = normalizeAiModerationResult(rawAnalysis?.moderation || {});

  if (!moderation.is_allowed) {
    return buildRejectedComplaintAnalysis({
      reason: moderation.block_reason || "out_of_scope",
      message: moderation.user_message,
      source: "gemini",
    });
  }

  const {
    title = "",
    description = "",
    isEmergency = false,
    hasPhotos = false,
    clusterInfo = null,
  } = fallbackInput;

  const fallbackCategory = detectComplaintCategoryFromKeywords(title, description);
  const category = normalizeComplaintCategory(rawAnalysis?.category || fallbackCategory);

  const aiEmergency = Boolean(
    rawAnalysis?.urgency_analysis?.is_emergency ?? rawAnalysis?.is_emergency
  );
  const is_emergency =
    aiEmergency ||
    isEmergency ||
    detectEmergencyFromText(title, description, false);

  const basePriority =
    rawAnalysis?.urgency_analysis?.priority ||
    rawAnalysis?.priority ||
    calculatePriorityFromKeywords(title, description, is_emergency);

  let priority = normalizePriorityLevel(basePriority, is_emergency);
  priority = applyClusterPriorityBoost(priority, clusterInfo);

  const urgencyReason =
    rawAnalysis?.urgency_analysis?.urgency_reason ||
    rawAnalysis?.reasoning ||
    "Priority was assigned from complaint urgency and severity.";

  return {
    category,
    assignedOffice: getAssignedOffice(category),
    priority,
    complaint_type: resolveComplaintType(is_emergency),
    is_emergency,
    confidence: Number(rawAnalysis?.confidence) || 0.75,
    reasoning:
      rawAnalysis?.reasoning ||
      "Complaint classified using LGU category rules and complaint content.",
    urgency_analysis: {
      is_emergency,
      complaint_type: resolveComplaintType(is_emergency),
      priority,
      severity_score: Number(rawAnalysis?.urgency_analysis?.severity_score) || 0.5,
      urgency_reason: urgencyReason,
    },
    duplicate: normalizeDuplicateResult(rawAnalysis?.duplicate),
    cluster: clusterInfo,
    cluster_analysis: {
      confirm_cluster: Boolean(
        rawAnalysis?.cluster_analysis?.confirm_cluster ?? clusterInfo?.is_cluster
      ),
      priority_impact:
        rawAnalysis?.cluster_analysis?.priority_impact ||
        clusterInfo?.summary ||
        "No cluster impact detected.",
    },
    image_analysis: normalizeImageAnalysis(rawAnalysis?.image_analysis, hasPhotos),
    moderation,
    allowed: true,
    rejected: false,
    source: "gemini",
  };
}

export function buildKeywordFallbackAnalysis({
  title = "",
  description = "",
  isEmergency = false,
  hasPhotos = false,
  clusterInfo = null,
}) {
  const category = detectComplaintCategoryFromKeywords(title, description);
  const is_emergency =
    isEmergency || detectEmergencyFromText(title, description, false);
  let priority = calculatePriorityFromKeywords(title, description, is_emergency);
  priority = applyClusterPriorityBoost(
    normalizePriorityLevel(priority, is_emergency),
    clusterInfo
  );

  return {
    category,
    assignedOffice: getAssignedOffice(category),
    priority,
    complaint_type: resolveComplaintType(is_emergency),
    is_emergency,
    confidence: 0.55,
    reasoning:
      "Complaint classified using keyword matching because AI analysis was unavailable.",
    urgency_analysis: {
      is_emergency,
      complaint_type: resolveComplaintType(is_emergency),
      priority,
      severity_score: is_emergency ? 0.9 : 0.45,
      urgency_reason:
        "Priority was estimated from keywords because AI urgency analysis was unavailable.",
    },
    duplicate: {
      is_duplicate: false,
      similar_complaint_id: null,
      similarity_score: 0,
      reason: "Duplicate check requires AI analysis.",
    },
    cluster: clusterInfo,
    cluster_analysis: {
      confirm_cluster: Boolean(clusterInfo?.is_cluster),
      priority_impact: clusterInfo?.summary || "No cluster impact detected.",
    },
    image_analysis: normalizeImageAnalysis({}, hasPhotos),
    allowed: true,
    rejected: false,
    source: "keywords",
  };
}

export async function readPhotoBase64(uri) {
  if (!uri) {
    return null;
  }

  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (error) {
    console.log("Read photo base64 error:", error);
    return null;
  }
}

export async function preparePhotoForGemini(uri) {
  if (!uri) {
    return null;
  }

  try {
    const manipulatedPhoto = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 768 } }],
      {
        compress: 0.55,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );

    const data = await readPhotoBase64(manipulatedPhoto.uri);

    if (!data) {
      return null;
    }

    return {
      mime_type: "image/jpeg",
      data,
    };
  } catch (error) {
    console.log("Prepare photo for Gemini error:", error);
    return null;
  }
}

export async function analyzeComplaintWithGemini({
  title,
  description,
  locationText,
  latitude,
  longitude,
  isEmergency = false,
  photoUris = [],
  existingComplaints = [],
  nearbyComplaints = [],
  clusterInfo = null,
}) {
  if (!getGeminiApiKey()) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  const photoImages = [];

  for (const uri of photoUris.slice(0, 2)) {
    const preparedPhoto = await preparePhotoForGemini(uri);

    if (preparedPhoto) {
      photoImages.push(preparedPhoto);
    }
  }

  const hasPhotos = photoImages.length > 0;
  const prompt = buildAnalysisPrompt({
    title,
    description,
    isEmergency,
    locationText,
    latitude,
    longitude,
    existingComplaints,
    nearbyComplaints,
    clusterInfo,
    hasPhotos,
  });

  const parts = [{ text: prompt }];

  for (const photo of photoImages) {
    parts.push({
      inline_data: {
        mime_type: photo.mime_type,
        data: photo.data,
      },
    });
  }

  const responseText = await callGeminiGenerate({ parts });
  const parsed = extractJsonObject(responseText);

  if (!parsed) {
    throw new Error("Gemini returned an unreadable analysis response.");
  }

  return normalizeGeminiAnalysis(parsed, {
    title,
    description,
    isEmergency,
    hasPhotos,
    clusterInfo,
  });
}

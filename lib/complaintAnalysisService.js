import {
  analyzeComplaintWithGemini,
  buildKeywordFallbackAnalysis,
  normalizeGeminiAnalysis,
  preparePhotoForGemini,
} from "./geminiComplaintAnalysis";
import {
  applyComplaintRoutingToAnalysis,
  detectComplaintCategoryFromKeywords,
} from "./complaintCategories";
import {
  analyzeComplaintCluster,
  applyClusterPriorityBoost,
  getBoundingBox,
  getDistanceKm,
} from "./complaintClusterDetection";
import {
  isComplaintAnalysisRejected,
  validateComplaintContentLocally,
} from "./complaintContentModeration";
import { supabase } from "./supabase";

const ACTIVE_STATUSES = ["Pending", "In Progress", "For Validation", "Returned"];
const MAX_EDGE_PHOTOS_EMERGENCY = 1;
const MAX_EDGE_PHOTOS_NON_EMERGENCY = 3;

async function buildPhotoPayload(photoUris = [], isEmergency = false) {
  const maxPhotos = isEmergency
    ? MAX_EDGE_PHOTOS_EMERGENCY
    : MAX_EDGE_PHOTOS_NON_EMERGENCY;
  const photoImages = [];

  for (const uri of photoUris.slice(0, maxPhotos)) {
    const preparedPhoto = await preparePhotoForGemini(uri);

    if (preparedPhoto) {
      photoImages.push(preparedPhoto);
    }
  }

  return photoImages;
}

export async function fetchRecentComplaintsForDuplicateCheck(userId, limit = 15) {
  if (!userId) {
    return [];
  }

  const { data, error } = await supabase
    .from("complaints")
    .select("id, title, description, category, location_text, status, submitted_date_time")
    .eq("citizen_id", userId)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.log("Fetch complaints for duplicate check error:", error);
    return [];
  }

  return data || [];
}

export async function fetchNearbyActiveComplaints({
  latitude,
  longitude,
  radiusKm = 0.5,
  excludeUserId = null,
  limit = 40,
}) {
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return [];
  }

  const bounds = getBoundingBox(latitude, longitude, radiusKm);

  let query = supabase
    .from("complaints")
    .select(
      "id, title, description, category, latitude, longitude, location_text, status, created_at, citizen_id"
    )
    .in("status", ACTIVE_STATUSES)
    .gte("latitude", bounds.minLat)
    .lte("latitude", bounds.maxLat)
    .gte("longitude", bounds.minLon)
    .lte("longitude", bounds.maxLon)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (excludeUserId) {
    query = query.neq("citizen_id", excludeUserId);
  }

  const { data, error } = await query;

  if (error) {
    console.log("Fetch nearby complaints error:", error);
    return [];
  }

  return (data || [])
    .map((item) => {
      const itemLat = Number(item.latitude);
      const itemLon = Number(item.longitude);

      if (Number.isNaN(itemLat) || Number.isNaN(itemLon)) {
        return null;
      }

      const distanceKm = getDistanceKm(latitude, longitude, itemLat, itemLon);

      if (distanceKm > radiusKm) {
        return null;
      }

      return {
        ...item,
        distance_km: Number(distanceKm.toFixed(3)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance_km - b.distance_km);
}

function finalizeAnalysis(analysis, {
  title = "",
  description = "",
  latitude,
  longitude,
  nearbyComplaints,
}) {
  const routedAnalysis = applyComplaintRoutingToAnalysis(analysis, {
    title,
    description,
  });

  const clusterInfo = analyzeComplaintCluster({
    latitude,
    longitude,
    category: routedAnalysis.category,
    nearbyComplaints,
  });

  const priority = applyClusterPriorityBoost(routedAnalysis.priority, clusterInfo);

  return {
    ...routedAnalysis,
    priority,
    complaint_type: analysis.complaint_type,
    urgency_analysis: {
      ...(analysis.urgency_analysis || {}),
      priority,
    },
    cluster: clusterInfo,
    cluster_analysis: {
      confirm_cluster: Boolean(
        analysis?.cluster_analysis?.confirm_cluster ?? clusterInfo.is_cluster
      ),
      priority_impact:
        analysis?.cluster_analysis?.priority_impact || clusterInfo.summary,
    },
  };
}

async function invokeEdgeFunctionAnalysis(sharedInput, photoImages, fallbackInput) {
  const { data, error } = await supabase.functions.invoke("analyze-complaint", {
    body: {
      ...sharedInput,
      photoImages,
    },
  });

  if (!error && data?.analysis && !data?.error) {
    return normalizeGeminiAnalysis(data.analysis, {
      ...fallbackInput,
      hasPhotos: photoImages.length > 0,
    });
  }

  if (data?.error) {
    console.log("Analyze complaint edge function error:", data.error);
  }

  if (error) {
    console.log("Analyze complaint edge function invoke error:", error);
  }

  return null;
}

export async function analyzeComplaint({
  title,
  description,
  locationText,
  latitude,
  longitude,
  isEmergency = false,
  photoUris = [],
  userId,
}) {
  const localModeration = validateComplaintContentLocally(title, description);

  if (!localModeration.allowed) {
    return localModeration;
  }

  const existingComplaints = await fetchRecentComplaintsForDuplicateCheck(userId);
  const nearbyComplaints = await fetchNearbyActiveComplaints({
    latitude,
    longitude,
    excludeUserId: userId,
  });

  const preliminaryCategory = detectComplaintCategoryFromKeywords(title, description);
  const preliminaryCluster = analyzeComplaintCluster({
    latitude,
    longitude,
    category: preliminaryCategory,
    nearbyComplaints,
  });

  const photoImages = await buildPhotoPayload(photoUris, isEmergency);
  const hasPhotos = photoImages.length > 0;

  const sharedInput = {
    title,
    description,
    locationText,
    latitude,
    longitude,
    isEmergency,
    existingComplaints,
    nearbyComplaints,
    clusterInfo: preliminaryCluster,
  };

  const fallbackInput = {
    title,
    description,
    isEmergency,
    clusterInfo: preliminaryCluster,
  };

  // Path 1: edge function (server-side Gemini + model backups).
  try {
    const edgeAnalysis = await invokeEdgeFunctionAnalysis(
      sharedInput,
      photoImages,
      fallbackInput
    );

    if (edgeAnalysis) {
      if (isComplaintAnalysisRejected(edgeAnalysis)) {
        return edgeAnalysis;
      }

      return finalizeAnalysis(edgeAnalysis, {
        title,
        description,
        latitude,
        longitude,
        nearbyComplaints,
      });
    }
  } catch (edgeFunctionError) {
    console.log("Analyze complaint edge function error:", edgeFunctionError);
  }

  // Path 2: on-device Gemini with automatic model fallbacks.
  try {
    const analysis = await analyzeComplaintWithGemini({
      ...sharedInput,
      photoUris,
    });

    if (isComplaintAnalysisRejected(analysis)) {
      return analysis;
    }

    return finalizeAnalysis(analysis, {
      title,
      description,
      latitude,
      longitude,
      nearbyComplaints,
    });
  } catch (geminiError) {
    console.log("Gemini complaint analysis error:", geminiError);
  }

  // Last resort only — all AI models were unavailable / rate-limited.
  const fallback = buildKeywordFallbackAnalysis({
    title,
    description,
    isEmergency,
    hasPhotos,
    clusterInfo: preliminaryCluster,
  });

  return finalizeAnalysis(fallback, {
    title,
    description,
    latitude,
    longitude,
    nearbyComplaints,
  });
}

export function shouldWarnAboutDuplicate(analysis) {
  return (
    analysis?.duplicate?.is_duplicate &&
    Number(analysis.duplicate.similarity_score) >= 0.75
  );
}

export function getDuplicateWarningMessage(analysis) {
  const reason =
    analysis?.duplicate?.reason ||
    "A similar complaint from you may already be active in the system.";

  return `${reason}\n\nDo you still want to submit this report?`;
}

export function shouldWarnAboutCluster(analysis) {
  return Boolean(analysis?.cluster?.is_cluster);
}

export function getClusterWarningMessage(analysis) {
  return (
    analysis?.cluster?.summary ||
    "Multiple similar complaints were reported nearby. This issue may affect others in the area."
  );
}

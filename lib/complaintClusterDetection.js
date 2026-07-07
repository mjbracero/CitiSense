const EARTH_RADIUS_KM = 6371;

export const DEFAULT_CLUSTER_RADIUS_KM = 0.5;
export const CLUSTER_MIN_SIMILAR_REPORTS = 2;

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function getBoundingBox(latitude, longitude, radiusKm = DEFAULT_CLUSTER_RADIUS_KM) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos(toRadians(latitude || 0)));

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLon: longitude - lonDelta,
    maxLon: longitude + lonDelta,
  };
}

function normalizeCategoryToken(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function categoriesAreSimilar(categoryA, categoryB) {
  const left = normalizeCategoryToken(categoryA);
  const right = normalizeCategoryToken(categoryB);

  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const leftRoot = left.replace(" concerns", "");
  const rightRoot = right.replace(" concerns", "");

  return (
    left.includes(rightRoot) ||
    right.includes(leftRoot) ||
    leftRoot.includes(rightRoot) ||
    rightRoot.includes(leftRoot)
  );
}

export function analyzeComplaintCluster({
  latitude,
  longitude,
  category,
  nearbyComplaints = [],
  radiusKm = DEFAULT_CLUSTER_RADIUS_KM,
}) {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    Number.isNaN(latitude) ||
    Number.isNaN(longitude)
  ) {
    return {
      is_cluster: false,
      nearby_count: 0,
      similar_category_count: 0,
      cluster_radius_km: radiusKm,
      nearby_reports: [],
      summary: "Location data was unavailable for cluster detection.",
    };
  }

  const nearbyReports = nearbyComplaints
    .filter((item) => {
      const itemLat = Number(item.latitude);
      const itemLon = Number(item.longitude);

      if (Number.isNaN(itemLat) || Number.isNaN(itemLon)) {
        return false;
      }

      return getDistanceKm(latitude, longitude, itemLat, itemLon) <= radiusKm;
    })
    .map((item) => {
      const itemLat = Number(item.latitude);
      const itemLon = Number(item.longitude);

      return {
        id: item.id,
        title: item.title,
        category: item.category,
        status: item.status,
        distance_km: Number(
          getDistanceKm(latitude, longitude, itemLat, itemLon).toFixed(3)
        ),
      };
    })
    .sort((a, b) => a.distance_km - b.distance_km);

  const similarReports = nearbyReports.filter((item) =>
    categoriesAreSimilar(item.category, category)
  );

  const similarCategoryCount = similarReports.length;
  const isCluster = similarCategoryCount >= CLUSTER_MIN_SIMILAR_REPORTS;

  let summary = "No nearby complaint cluster was detected in this area.";

  if (isCluster) {
    summary = `${similarCategoryCount} similar ${category || "complaint"} report(s) were found within ${Math.round(radiusKm * 1000)} meters. This may indicate a recurring issue requiring prompt LGU action.`;
  } else if (nearbyReports.length > 0) {
    summary = `${nearbyReports.length} other active complaint(s) exist nearby, but they appear to be different concern types.`;
  }

  return {
    is_cluster: isCluster,
    nearby_count: nearbyReports.length,
    similar_category_count: similarCategoryCount,
    cluster_radius_km: radiusKm,
    nearby_reports: nearbyReports.slice(0, 8),
    similar_reports: similarReports.slice(0, 8),
    summary,
  };
}

export function applyClusterPriorityBoost(priority, cluster) {
  const normalizedPriority = normalizePriorityLevel(priority);
  const similarCount = Number(cluster?.similar_category_count) || 0;

  if (!cluster?.is_cluster || similarCount < CLUSTER_MIN_SIMILAR_REPORTS) {
    return normalizedPriority;
  }

  if (similarCount >= 5 && normalizedPriority !== "Critical") {
    return "Critical";
  }

  if (similarCount >= 3) {
    if (normalizedPriority === "Low") return "High";
    if (normalizedPriority === "Normal") return "High";
  }

  if (similarCount >= CLUSTER_MIN_SIMILAR_REPORTS && normalizedPriority === "Low") {
    return "Normal";
  }

  return normalizedPriority;
}

export function normalizePriorityLevel(priority, isEmergency = false) {
  if (isEmergency) {
    return "Critical";
  }

  const clean = String(priority || "")
    .trim()
    .toLowerCase();

  if (clean === "critical" || clean === "urgent") return "Critical";
  if (clean === "high") return "High";
  if (clean === "low") return "Low";

  return "Normal";
}

export function detectEmergencyFromText(title = "", description = "", isEmergency = false) {
  if (isEmergency) {
    return true;
  }

  const text = `${title} ${description}`.toLowerCase();

  const emergencySignals = [
    "emergency",
    "urgent",
    "life threatening",
    "immediate help",
    "911",
    "sunog",
    "fire",
    "drowning",
    "nalumos",
    "lunod",
    "shooting",
    "stabbing",
    "murder",
    "hostage",
    "explosion",
    "landslide",
    "earthquake",
    "heart attack",
    "unconscious",
    "bleeding",
    "accident",
    "rescue",
    "kagipitan",
    "delikado",
    "emergency",
  ];

  return emergencySignals.some((signal) => text.includes(signal));
}

export function resolveComplaintType(isEmergency) {
  return isEmergency ? "Emergency" : "Non-Emergency";
}

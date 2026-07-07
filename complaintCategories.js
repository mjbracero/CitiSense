export const DEPARTMENT_BY_CATEGORY = {
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

export const COMPLAINT_CATEGORY_NAMES = Object.keys(DEPARTMENT_BY_CATEGORY);

const CATEGORY_KEYWORDS = [
  {
    category: "Fire Safety Concerns",
    keywords: ["fire", "sunog", "smoke", "burning", "flame", "gas leak", "explosion"],
  },
  {
    category: "Disaster and Emergency Concerns",
    keywords: ["disaster", "emergency", "rescue", "landslide", "earthquake", "storm", "calamity"],
  },
  {
    category: "Peace and Order Concerns",
    keywords: ["crime", "fight", "police", "robbery", "violence", "shooting", "murder"],
  },
  {
    category: "Water Concerns",
    keywords: ["water", "tubig", "leak", "pipe", "no water", "dirty water"],
  },
  {
    category: "Electricity Concerns",
    keywords: ["electricity", "power", "brownout", "kuryente", "wire", "power outage"],
  },
  {
    category: "Streetlight Concerns",
    keywords: ["streetlight", "street light", "poste", "lamp post", "dark road"],
  },
  {
    category: "Road and Infrastructure Concerns",
    keywords: ["road", "pothole", "bridge", "sidewalk", "infrastructure"],
  },
  {
    category: "Drainage and Flooding Concerns",
    keywords: ["drainage", "flood", "flooding", "baha", "canal", "sewer"],
  },
  {
    category: "Waste and Environmental Concerns",
    keywords: ["garbage", "trash", "waste", "basura", "pollution", "litter"],
  },
  {
    category: "Traffic and Road Safety Concerns",
    keywords: ["traffic", "accident", "parking", "crosswalk", "road safety"],
  },
];

const CRITICAL_KEYWORDS = [
  "fire",
  "sunog",
  "murder",
  "shooting",
  "stabbing",
  "drowning",
  "landslide",
  "earthquake",
  "explosion",
  "emergency",
];

const HIGH_KEYWORDS = [
  "accident",
  "flood",
  "baha",
  "no water",
  "power outage",
  "dog bite",
  "unsafe",
];

export function normalizeComplaintCategory(category) {
  if (!category) {
    return "Unclassified";
  }

  const cleanCategory = String(category).trim();

  if (DEPARTMENT_BY_CATEGORY[cleanCategory]) {
    return cleanCategory;
  }

  const lowerCategory = cleanCategory.toLowerCase();

  const matched = COMPLAINT_CATEGORY_NAMES.find((item) => {
    const lowerItem = item.toLowerCase();
    return (
      lowerItem === lowerCategory ||
      lowerItem.includes(lowerCategory) ||
      lowerCategory.includes(lowerItem.replace(" concerns", ""))
    );
  });

  return matched || "Unclassified";
}

export function detectComplaintCategoryFromKeywords(title = "", description = "") {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();

  for (const item of CATEGORY_KEYWORDS) {
    const matched = item.keywords.some((keyword) =>
      combinedText.includes(keyword.toLowerCase())
    );

    if (matched) {
      return item.category;
    }
  }

  return "Unclassified";
}

export function getAssignedOffice(category, existingOffice = null) {
  if (existingOffice && existingOffice !== "Unassigned") {
    return existingOffice;
  }

  const normalizedCategory = normalizeComplaintCategory(category);
  return DEPARTMENT_BY_CATEGORY[normalizedCategory] || "Unassigned";
}

export function calculatePriorityFromKeywords(
  title = "",
  description = "",
  isEmergency = false
) {
  if (isEmergency) {
    return "Critical";
  }

  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();

  if (CRITICAL_KEYWORDS.some((keyword) => combinedText.includes(keyword))) {
    return "Critical";
  }

  if (HIGH_KEYWORDS.some((keyword) => combinedText.includes(keyword))) {
    return "High";
  }

  return "Normal";
}

export function getCategoryIcon(category = "") {
  const normalized = normalizeComplaintCategory(category);
  const lower = normalized.toLowerCase();

  if (lower.includes("water")) return "water-outline";
  if (lower.includes("electric")) return "flash-outline";
  if (lower.includes("streetlight")) return "bulb-outline";
  if (lower.includes("road") || lower.includes("infrastructure")) {
    return "construct-outline";
  }
  if (lower.includes("drainage") || lower.includes("flood")) return "rainy-outline";
  if (lower.includes("waste") || lower.includes("environment")) return "trash-outline";
  if (lower.includes("traffic")) return "car-outline";
  if (lower.includes("fire")) return "flame-outline";
  if (lower.includes("peace") || lower.includes("order")) return "shield-outline";
  if (lower.includes("health")) return "medkit-outline";
  if (lower.includes("animal")) return "paw-outline";

  return "document-text-outline";
}

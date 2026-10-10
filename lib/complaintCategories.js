/** One primary LGU office per concern category. */
export const DEPARTMENTS_BY_CATEGORY = {
  "Water Concerns": ["Bogo Water District"],
  "Streetlight Concerns": ["City Engineering Office"],
  "Road and Infrastructure Concerns": ["City Engineering Office"],
  "Drainage and Flooding Concerns": ["City Engineering Office"],
  "Waste and Environmental Concerns": ["CENRO"],
  "Traffic and Road Safety Concerns": ["BTMO"],
  "Transport Terminal Concerns": ["Bogo City Central Bus Terminal Office"],
  "Port Concerns": ["Polambato Port Office"],
  "Health and Sanitation Concerns": ["City Health Office"],
  "Animal Concerns": ["City Veterinary Office"],
  "Building and Construction Concerns": ["Office of the Building Official"],
  "Planning and Zoning Concerns": ["City Planning and Development Office"],
  "Public Market Concerns": ["Bogo Public Market Office"],
  "Public Plaza Concerns": ["Bogo Public Plaza Office"],
  "Public Library Concerns": ["Bogo Public Library Office"],
  "City Facility Concerns": ["General Services Office"],
  "Disaster and Emergency Concerns": ["CDRRMO"],
  "Fire Safety Concerns": ["BFP Bogo City Fire Station"],
  "Peace and Order Concerns": ["Bogo City Police Station / PNP"],
  "Coastal and Marine Protection Concerns": ["Bantay Dagat"],
  "PWD Accessibility Concerns": ["PDAO"],
  "Tax and Treasury Concerns": ["City Treasurer's Office"],
  "Property Assessment Concerns": ["City Assessor's Office"],
  "Civil Registry Concerns": ["City Civil Registrar's Office"],
};

/**
 * Optional partner offices for AI dual-routing.
 * Never auto-assigned by category — only when complaint content clearly needs both.
 */
export const DUAL_ROUTE_CANDIDATES_BY_CATEGORY = {
  "Drainage and Flooding Concerns": ["CDRRMO"],
  "Traffic and Road Safety Concerns": [
    "Bogo City Police Station / PNP",
    "CDRRMO",
  ],
  "Peace and Order Concerns": ["CDRRMO"],
  "Building and Construction Concerns": ["City Engineering Office"],
  "Disaster and Emergency Concerns": [
    "Bogo City Police Station / PNP",
    "BFP Bogo City Fire Station",
  ],
  "Fire Safety Concerns": ["CDRRMO"],
  "Coastal and Marine Protection Concerns": ["CENRO"],
};

/** Road/vehicular accidents need police response + CDRRMO. */
export const ROAD_ACCIDENT_DUAL_OFFICE =
  "Bogo City Police Station / PNP & CDRRMO";

const ROAD_ACCIDENT_KEYWORDS = [
  "aksidente",
  "naaksidente",
  "disgrasya",
  "desgrasya",
  "accident",
  "bangga",
  "banggaan",
  "nabangga",
  "nakabangga",
  "collision",
  "vehicular accident",
  "car accident",
  "motorcycle accident",
  "road accident",
];

export function isRoadAccidentComplaint(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  return ROAD_ACCIDENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function formatAssignedOffices(offices = []) {
  return [...new Set(offices.filter(Boolean))].join(" & ");
}

/** Primary office only — used for reassignment and default category routing. */
export function getPrimaryAssignedOffice(category) {
  const direct = DEPARTMENTS_BY_CATEGORY[category];
  if (direct?.[0]) return direct[0];

  const normalized = normalizeComplaintCategory(category);
  return DEPARTMENTS_BY_CATEGORY[normalized]?.[0] || null;
}

/** @deprecated Use DUAL_ROUTE_CANDIDATES_BY_CATEGORY — kept for older imports. */
export const RELATED_OFFICES_BY_CATEGORY = DUAL_ROUTE_CANDIDATES_BY_CATEGORY;

export const DEPARTMENT_BY_CATEGORY = Object.fromEntries(
  Object.entries(DEPARTMENTS_BY_CATEGORY).map(([category, offices]) => [
    category,
    (Array.isArray(offices) ? offices[0] : offices) || "Unassigned",
  ])
);

export const COMPLAINT_CATEGORY_NAMES = Object.keys(DEPARTMENTS_BY_CATEGORY);

export const CONCERN_DEPARTMENT_OPTIONS = COMPLAINT_CATEGORY_NAMES.map(
  (category) => ({
    category,
    department: getPrimaryAssignedOffice(category) || "Unassigned",
  })
);

export const DEPARTMENT_OFFICES = [
  ...new Set(Object.values(DEPARTMENTS_BY_CATEGORY).flat()),
].sort((a, b) => a.localeCompare(b));

export function normalizeOfficeKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const ASSIGNED_OFFICE_ALIASES = {
  "cdrrmo / emergency response office": "CDRRMO",
  "cdrrmo / emergency response": "CDRRMO",
  "emergency response office": "CDRRMO",
  "city engineering department": "City Engineering Office",
  "engineering office": "City Engineering Office",
  "city assessor office": "City Assessor's Office",
  "city assessors office": "City Assessor's Office",
  "assessor's office": "City Assessor's Office",
  "city treasurer office": "City Treasurer's Office",
  "treasurer's office": "City Treasurer's Office",
  "city civil registrar office": "City Civil Registrar's Office",
  "civil registrar's office": "City Civil Registrar's Office",
  "city planning and development office": "City Planning and Development Office",
  "city planning and zoning office": "City Planning and Development Office",
  "city planning and development office / zoning office":
    "City Planning and Development Office",
  "city planning office": "City Planning and Development Office",
  "planning and zoning office": "City Planning and Development Office",
  "planning and development office": "City Planning and Development Office",
  "zoning office": "City Planning and Development Office",
  zoning: "City Planning and Development Office",
  "bogo city police station / pnp": "Bogo City Police Station / PNP",
  pnp: "Bogo City Police Station / PNP",
  "bfp bogo city fire station": "BFP Bogo City Fire Station",
  bfp: "BFP Bogo City Fire Station",
  "city building official": "Office of the Building Official",
  "office of the city building official": "Office of the Building Official",
  "building official": "Office of the Building Official",
  obo: "Office of the Building Official",
  "bogo public library office": "Bogo Public Library Office",
  "bogo public library": "Bogo Public Library Office",
  "public library": "Bogo Public Library Office",
};

const GENERIC_OFFICE_WORDS = new Set([
  "office",
  "city",
  "the",
  "of",
  "and",
  "lgu",
  "bogo",
  "department",
]);

function significantOfficeTokens(value) {
  return normalizeOfficeKey(value)
    .split(" ")
    .filter((token) => token.length > 2 && !GENERIC_OFFICE_WORDS.has(token));
}

function officesAlignByTokens(left, right) {
  const leftTokens = significantOfficeTokens(left);
  const rightTokens = significantOfficeTokens(right);

  if (!leftTokens.length || !rightTokens.length) {
    return false;
  }

  const shared = leftTokens.filter((token) => rightTokens.includes(token));
  const minimum = Math.min(leftTokens.length, rightTokens.length);

  return shared.length >= Math.max(1, Math.min(2, minimum));
}

function findCanonicalOffice(value) {
  const key = normalizeOfficeKey(value);
  if (!key) return null;

  if (ASSIGNED_OFFICE_ALIASES[key]) {
    return ASSIGNED_OFFICE_ALIASES[key];
  }

  const exact = DEPARTMENT_OFFICES.find(
    (office) => normalizeOfficeKey(office) === key
  );
  if (exact) return exact;

  const partial = DEPARTMENT_OFFICES.find((office) => {
    const officeKey = normalizeOfficeKey(office);
    return key.includes(officeKey) || officeKey.includes(key);
  });
  if (partial) return partial;

  return (
    DEPARTMENT_OFFICES.find((office) => officesAlignByTokens(office, value)) ||
    null
  );
}

/** Normalize a department head profile office to the canonical LGU name. */
export function resolveDepartmentHeadOffice(value) {
  return (
    findCanonicalOffice(value) || String(value || "").replace(/\s+/g, " ").trim()
  );
}

export function departmentKeysMatch(left, right) {
  const leftOffice = resolveDepartmentHeadOffice(left);
  const rightOffice = resolveDepartmentHeadOffice(right);
  const leftKey = normalizeOfficeKey(leftOffice);
  const rightKey = normalizeOfficeKey(rightOffice);

  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;

  return (
    leftKey.includes(rightKey) ||
    rightKey.includes(leftKey) ||
    officesAlignByTokens(leftOffice, rightOffice)
  );
}

/** Map legacy / variant office names to the canonical LGU department list. */
export function normalizeAssignedOffice(value, category = null) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();

  if (!clean || normalizeOfficeKey(clean) === "unassigned") {
    const offices = getAssignedOffices(category);
    return offices[0] || null;
  }

  return findCanonicalOffice(clean);
}

/** Resolve one complaint to zero or more known department offices for analytics. */
export function resolveAssignedOfficesForAnalytics(assignedOffice, category = null) {
  return getAssignedOffices(category, assignedOffice);
}

export function assignedOfficeIncludesDepartment(assignedOffice, department) {
  const canonicalDept = resolveDepartmentHeadOffice(department);
  const deptKey = normalizeOfficeKey(canonicalDept);
  if (!deptKey) return false;

  return parseAssignedOffices(assignedOffice).some((part) => {
    const canonical = findCanonicalOffice(part);
    if (!canonical) return false;

    return departmentKeysMatch(canonical, canonicalDept);
  });
}

export function complaintAppliesToDepartment(
  assignedOffice,
  category,
  department
) {
  const canonicalDept = resolveDepartmentHeadOffice(department);
  const deptKey = normalizeOfficeKey(canonicalDept);
  if (!deptKey) return false;

  if (assignedOfficeIncludesDepartment(assignedOffice, canonicalDept)) {
    return true;
  }

  const normalizedCategory = normalizeComplaintCategory(category);
  const relatedOffices = DEPARTMENTS_BY_CATEGORY[normalizedCategory] || [];
  const deptRelatesToCategory = relatedOffices.some((office) =>
    departmentKeysMatch(office, canonicalDept)
  );

  if (!deptRelatesToCategory) {
    return false;
  }

  const assignedKeys = parseAssignedOffices(assignedOffice)
    .map((part) => findCanonicalOffice(part))
    .filter(Boolean)
    .map((office) => normalizeOfficeKey(office));

  if (assignedKeys.length === 0) {
    return false;
  }

  return assignedKeys.some((assignedKey) =>
    relatedOffices.some(
      (office) =>
        normalizeOfficeKey(resolveDepartmentHeadOffice(office)) === assignedKey
    )
  );
}

export function getCategoriesForDepartment(department) {
  const deptKey = normalizeOfficeKey(department);
  if (!deptKey) return [];

  return COMPLAINT_CATEGORY_NAMES.filter((category) =>
    (DEPARTMENTS_BY_CATEGORY[category] || []).some(
      (office) => normalizeOfficeKey(office) === deptKey
    )
  );
}

export function isKnownDepartmentOffice(value) {
  return Boolean(findCanonicalOffice(value));
}

const CATEGORY_KEYWORDS = [
  {
    category: "Fire Safety Concerns",
    keywords: ["fire", "sunog", "smoke", "burning", "flame", "gas leak", "explosion", "bfp"],
  },
  {
    category: "Disaster and Emergency Concerns",
    keywords: [
      "disaster",
      "emergency",
      "rescue",
      "landslide",
      "earthquake",
      "storm",
      "calamity",
      "evacuation",
      "cdrrmo",
      "aksidente",
      "accident",
      "live wire",
      "fallen wire",
      "electrocution",
    ],
  },
  {
    category: "Peace and Order Concerns",
    keywords: [
      "crime",
      "fight",
      "police",
      "robbery",
      "violence",
      "shooting",
      "murder",
      "theft",
      "vandalism",
      "public disturbance",
    ],
  },
  {
    category: "Water Concerns",
    keywords: [
      "water",
      "tubig",
      "no water",
      "walay tubig",
      "dirty water",
      "burst pipe",
      "broken pipe",
      "water interruption",
      "low pressure",
      "bogo water",
    ],
  },
  {
    category: "Streetlight Concerns",
    keywords: ["streetlight", "street light", "lamp post", "dark road", "poste suga", "broken streetlight"],
  },
  {
    category: "Traffic and Road Safety Concerns",
    keywords: [
      "traffic",
      "road safety",
      "accident",
      "aksidente",
      "disgrasya",
      "desgrasya",
      "bangga",
      "banggaan",
      "nabangga",
      "nakabangga",
      "crash",
      "parking",
      "illegal parking",
      "crosswalk",
      "reckless driving",
      "speeding",
      "road obstruction",
      "blocked lane",
      "btmo",
    ],
  },
  {
    category: "Civil Registry Concerns",
    keywords: [
      "civil registrar",
      "birth certificate",
      "marriage certificate",
      "death certificate",
      "civil registry",
      "psa",
      "birth cert",
      "marriage cert",
      "death cert",
      "certificate of live birth",
      "pagkuha sa certificate",
      "kuha sa certificate",
    ],
  },
  {
    category: "Property Assessment Concerns",
    keywords: [
      "assessor",
      "assessment",
      "property valuation",
      "land valuation",
      "tax declaration",
      "city assessor",
    ],
  },
  {
    category: "Tax and Treasury Concerns",
    keywords: [
      "tax",
      "treasury",
      "treasurer",
      "city treasurer",
      "treasurer's office",
      "treasurers office",
      "city treasurer's office",
      "real property tax",
      "business tax",
      "tax payment",
      "tax receipt",
      "community tax",
      "cedula",
      "bayad sa tax",
      "bayad sa treasurer",
      "business permit",
      "mayor's permit",
      "mayors permit",
      "mayor permit",
      "licensing",
      "bplo",
      "business license",
      "permit application",
      "business permit application",
      "permit process",
    ],
  },
  {
    category: "Transport Terminal Concerns",
    keywords: [
      "bus terminal",
      "van terminal",
      "jeepney terminal",
      "transport terminal",
      "terminal fare",
      "overcharging fare",
      "passenger queue",
      "central bus terminal",
    ],
  },
  {
    category: "Port Concerns",
    keywords: [
      "polambato",
      "polambato port",
      "port office",
      "passenger port",
      "ferry",
      "barko",
      "wharf",
      "pier",
    ],
  },
  {
    category: "PWD Accessibility Concerns",
    keywords: [
      "pwd",
      "accessibility",
      "wheelchair",
      "wheelchair ramp",
      "handrail",
      "disabled",
      "disability",
      "accessible",
      "pdao",
      "senior access",
      "blocked ramp",
    ],
  },
  {
    category: "Coastal and Marine Protection Concerns",
    keywords: [
      "coastal",
      "marine",
      "illegal fishing",
      "bantay dagat",
      "mangrove",
      "fish kill",
      "coral",
      "shoreline",
      "coastal waste",
    ],
  },
  {
    category: "Drainage and Flooding Concerns",
    keywords: ["drainage", "flood", "flooding", "flooded", "baha", "canal", "sewer", "clogged drainage"],
  },
  {
    category: "Road and Infrastructure Concerns",
    keywords: ["road", "pothole", "bridge", "sidewalk", "infrastructure", "damaged road", "uneven road"],
  },
  {
    category: "Waste and Environmental Concerns",
    keywords: ["garbage", "trash", "waste", "basura", "pollution", "litter", "cenro"],
  },
  {
    category: "Building and Construction Concerns",
    keywords: [
      "building permit",
      "construction",
      "structural",
      "illegal structure",
      "building code",
      "building official",
      "obo",
      "illegal construction",
      "unsafe structure",
    ],
  },
  {
    category: "Health and Sanitation Concerns",
    keywords: [
      "health",
      "sanitation",
      "clinic",
      "hospital",
      "fever",
      "dengue",
      "illness",
      "food poisoning",
      "unsanitary",
      "city health",
    ],
  },
  {
    category: "Animal Concerns",
    keywords: ["stray dog", "stray cat", "dog bite", "rabies", "livestock", "veterinary", "aggressive dog"],
  },
  {
    category: "Public Market Concerns",
    keywords: ["public market", "merkado", "wet market", "market vendor", "market stall"],
  },
  {
    category: "Public Plaza Concerns",
    keywords: ["public plaza", "plaza", "playground", "park bench"],
  },
  {
    category: "Planning and Zoning Concerns",
    keywords: ["zoning", "land use", "subdivision", "setback", "building plan approval"],
  },
  {
    category: "Public Library Concerns",
    keywords: [
      "public library",
      "bogo public library",
      "library book",
      "reading room",
      "langas sa library",
      "library",
      "libro",
    ],
  },
  {
    category: "City Facility Concerns",
    keywords: [
      "city facility",
      "city hall",
      "gymnasium",
      "covered court",
      "sports complex",
      "multi-purpose hall",
      "public building",
      "public restroom",
      "waiting area",
      "general services",
      "gso",
      "tourism",
      "tourist",
      "tourist spot",
      "public attraction",
      "tourism site",
      "heritage site",
    ],
  },
];

/** Categories that may override AI only for known high-risk misroutes. */
const KEYWORD_HARD_OVERRIDE_CATEGORIES = new Set([
  "Civil Registry Concerns",
  "Tax and Treasury Concerns",
  "Property Assessment Concerns",
  "Fire Safety Concerns",
  "Peace and Order Concerns",
]);

const AI_CATCHALL_CATEGORIES = new Set([
  "City Facility Concerns",
  "Unclassified",
]);

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

  if (DEPARTMENTS_BY_CATEGORY[cleanCategory]) {
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

export function scoreComplaintCategoryKeywords(title = "", description = "") {
  const combinedText = `${title || ""} ${description || ""}`.toLowerCase();
  let bestCategory = "Unclassified";
  let bestScore = 0;

  for (const item of CATEGORY_KEYWORDS) {
    let score = 0;

    for (const keyword of item.keywords) {
      const needle = keyword.toLowerCase();
      if (!needle || !combinedText.includes(needle)) continue;

      // Longer / more specific phrases win over short generic tokens.
      score += Math.max(1, needle.split(/\s+/).length) * needle.length;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = item.category;
    }
  }

  return { category: bestCategory, score: bestScore };
}

export function detectComplaintCategoryFromKeywords(title = "", description = "") {
  return scoreComplaintCategoryKeywords(title, description).category;
}

/**
 * AI-first category reconciliation.
 * Keywords are a safety net for catch-all AI answers and known high-risk misroutes.
 */
export function reconcileComplaintCategory(
  title = "",
  description = "",
  aiCategory = "",
  options = {}
) {
  const normalizedAi = normalizeComplaintCategory(aiCategory);
  const { category: keywordCategory, score: keywordScore } =
    scoreComplaintCategoryKeywords(title, description);
  const confidence = Number(options.confidence);
  const hasStrongAiConfidence =
    !Number.isFinite(confidence) || confidence >= 0.55;
  const hasStrongKeywordEvidence = keywordScore >= 24;

  // No keyword signal — trust AI (or Unclassified).
  if (keywordCategory === "Unclassified") {
    return normalizedAi;
  }

  // AI catch-all / empty → use keywords.
  if (AI_CATCHALL_CATEGORIES.has(normalizedAi)) {
    return keywordCategory;
  }

  // AI is specific and confident → prefer AI.
  // Keywords may still override for known high-risk misroutes with strong evidence.
  if (
    hasStrongAiConfidence &&
    !(
      KEYWORD_HARD_OVERRIDE_CATEGORIES.has(keywordCategory) &&
      hasStrongKeywordEvidence &&
      keywordCategory !== normalizedAi
    )
  ) {
    return normalizedAi;
  }

  // Low AI confidence or hard-override keyword conflict → prefer keywords.
  if (
    KEYWORD_HARD_OVERRIDE_CATEGORIES.has(keywordCategory) &&
    hasStrongKeywordEvidence
  ) {
    return keywordCategory;
  }

  if (!hasStrongAiConfidence && hasStrongKeywordEvidence) {
    return keywordCategory;
  }

  return normalizedAi;
}

function getCategoriesForKnownOffice(officeValue) {
  const offices = parseAssignedOffices(officeValue)
    .map((part) => findCanonicalOffice(part))
    .filter(Boolean);

  if (!offices.length) return [];

  return COMPLAINT_CATEGORY_NAMES.filter((category) => {
    const categoryOffices = DEPARTMENTS_BY_CATEGORY[category] || [];
    return offices.every((office) =>
      categoryOffices.some((categoryOffice) =>
        departmentKeysMatch(categoryOffice, office)
      )
    );
  });
}

function formatKnownAssignedOffice(officeValue) {
  const offices = parseAssignedOffices(officeValue)
    .map((part) => findCanonicalOffice(part))
    .filter(Boolean);

  return offices.length ? formatAssignedOffices(offices) : null;
}

/** Derive category and assigned office from AI category + keyword safety net. */
export function resolveComplaintRouting(
  title = "",
  description = "",
  aiCategory = "",
  existingOffice = null,
  options = {}
) {
  let category = reconcileComplaintCategory(title, description, aiCategory, options);
  const knownExistingOffice = formatKnownAssignedOffice(existingOffice);

  // One office per category by default.
  // Keep "A & B" only when AI/content already dual-routed the complaint.
  let assignedOffice = getAssignedOffice(category, existingOffice);

  // Never wipe a known LGU office with Unassigned when keyword/AI category is weak.
  if (
    (!assignedOffice || normalizeOfficeKey(assignedOffice) === "unassigned") &&
    knownExistingOffice
  ) {
    assignedOffice = knownExistingOffice;
  }

  if (
    (category === "Unclassified" || category === "City Facility Concerns") &&
    knownExistingOffice
  ) {
    const officeCategories = getCategoriesForKnownOffice(knownExistingOffice);
    if (officeCategories.length === 1) {
      category = officeCategories[0];
      assignedOffice = getAssignedOffice(category);
    } else if (officeCategories.length > 1 && category === "Unclassified") {
      category = officeCategories[0];
      assignedOffice = knownExistingOffice;
    }
  }

  // Final guard: classified complaints must never remain Unassigned.
  if (
    category !== "Unclassified" &&
    (!assignedOffice || normalizeOfficeKey(assignedOffice) === "unassigned")
  ) {
    assignedOffice = getAssignedOffice(category);
  }

  // Road accidents (e.g. "naay aksidente ari sa Lapaz") need PNP + CDRRMO.
  if (isRoadAccidentComplaint(title, description)) {
    const accidentCategories = new Set([
      "Disaster and Emergency Concerns",
      "Traffic and Road Safety Concerns",
      "Peace and Order Concerns",
    ]);

    if (!accidentCategories.has(category)) {
      category = "Disaster and Emergency Concerns";
    }

    assignedOffice = ROAD_ACCIDENT_DUAL_OFFICE;
  }

  return {
    category,
    assignedOffice,
    routingSource: AI_CATCHALL_CATEGORIES.has(
      normalizeComplaintCategory(aiCategory)
    )
      ? "ai+keywords"
      : "ai",
  };
}

/** Reconcile category and office on an analysis result before persisting a complaint. */
export function applyComplaintRoutingToAnalysis(
  analysis = {},
  { title = "", description = "" } = {}
) {
  const { category, assignedOffice, routingSource } = resolveComplaintRouting(
    title,
    description,
    analysis.category,
    analysis.assignedOffice,
    { confidence: analysis.confidence }
  );

  return {
    ...analysis,
    category,
    assignedOffice,
    routingSource,
  };
}

export function getAssignedOffices(category, existingOffice = null) {
  const normalizedCategory = normalizeComplaintCategory(category);
  const categoryOffices = [...(DEPARTMENTS_BY_CATEGORY[normalizedCategory] || [])];
  const clean = String(existingOffice || "").replace(/\s+/g, " ").trim();
  const explicitOffices =
    clean && normalizeOfficeKey(clean) !== "unassigned"
      ? parseAssignedOffices(clean)
          .map((part) => findCanonicalOffice(part))
          .filter(Boolean)
      : [];

  if (categoryOffices.length > 0) {
    return [...new Set([...categoryOffices, ...explicitOffices])];
  }

  return [...new Set(explicitOffices)];
}

/**
 * Default: one primary office per category.
 * Preserve multi-office ("A & B") only when already set (e.g. AI dual-route).
 */
export function getAssignedOffice(category, existingOffice = null) {
  const clean = String(existingOffice || "").replace(/\s+/g, " ").trim();
  const knownExistingOffice = formatKnownAssignedOffice(clean);

  if (knownExistingOffice && knownExistingOffice.includes(" & ")) {
    return knownExistingOffice;
  }

  const primary = getPrimaryAssignedOffice(category);
  if (primary) {
    return primary;
  }

  if (knownExistingOffice) {
    return knownExistingOffice;
  }

  if (clean && normalizeOfficeKey(clean) !== "unassigned") {
    return clean;
  }

  return "Unassigned";
}

/** Split dual-routed offices, e.g. "BFP Bogo City Fire Station & CDRRMO". */
export function parseAssignedOffices(department = "") {
  return String(department || "")
    .split(/\s*&\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
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
  if (lower.includes("tax") || lower.includes("treasury")) return "cash-outline";
  if (lower.includes("assessment") || lower.includes("assessor")) {
    return "home-outline";
  }
  if (lower.includes("civil registry") || lower.includes("registrar")) {
    return "document-outline";
  }
  if (lower.includes("library")) return "book-outline";

  return "document-text-outline";
}

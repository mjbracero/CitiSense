/** Primary and related LGU offices per concern category. */
export const DEPARTMENTS_BY_CATEGORY = {
  "Water Concerns": ["Bogo Water District"],
  "Electricity Concerns": ["CEBECO II"],
  "Streetlight Concerns": ["City Engineering Office"],
  "Road and Infrastructure Concerns": ["City Engineering Office"],
  "Drainage and Flooding Concerns": [
    "City Engineering Office",
    "CDRRMO",
  ],
  "Waste and Environmental Concerns": ["CENRO"],
  "Traffic and Road Safety Concerns": [
    "BTMO",
    "Bogo City Police Station / PNP",
  ],
  "Transport Terminal Concerns": ["Bogo City Central Bus Terminal Office"],
  "Port Concerns": ["Polambato Port Office"],
  "Health and Sanitation Concerns": ["City Health Office", "CENRO"],
  "Animal Concerns": ["City Veterinary Office"],
  "Building and Construction Concerns": [
    "Office of the Building Official",
    "City Engineering Office",
  ],
  "Planning and Zoning Concerns": [
    "City Planning and Development Office / Zoning Office",
  ],
  "Public Market Concerns": ["Bogo Public Market Office"],
  "Public Plaza Concerns": ["Bogo Public Plaza Office"],
  "City Facility Concerns": ["General Services Office"],
  "Tourism Site / Public Attraction Concerns": ["City Tourism Office"],
  "Disaster and Emergency Concerns": [
    "CDRRMO",
    "BFP Bogo City Fire Station",
  ],
  "Fire Safety Concerns": ["BFP Bogo City Fire Station", "CDRRMO"],
  "Peace and Order Concerns": ["Bogo City Police Station / PNP"],
  "Coastal and Marine Protection Concerns": ["Bantay Dagat", "CENRO"],
  "PWD Accessibility Concerns": ["PDAO"],
  "Tax and Treasury Concerns": ["City Treasurer's Office"],
  "Property Assessment Concerns": ["City Assessor's Office"],
  "Civil Registry Concerns": ["City Civil Registrar's Office"],
  "Business Permit and Licensing Concerns": [
    "City Business Permit and Licensing Office",
  ],
};

export function formatAssignedOffices(offices = []) {
  return [...new Set(offices.filter(Boolean))].join(" & ");
}

export const DEPARTMENT_BY_CATEGORY = Object.fromEntries(
  Object.entries(DEPARTMENTS_BY_CATEGORY).map(([category, offices]) => [
    category,
    formatAssignedOffices(offices),
  ])
);

export const COMPLAINT_CATEGORY_NAMES = Object.keys(DEPARTMENTS_BY_CATEGORY);

export const CONCERN_DEPARTMENT_OPTIONS = COMPLAINT_CATEGORY_NAMES.map(
  (category) => ({
    category,
    department: formatAssignedOffices(DEPARTMENTS_BY_CATEGORY[category] || []),
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
  "city business permit and licensing office":
    "City Business Permit and Licensing Office",
  bplo: "City Business Permit and Licensing Office",
  "business permit and licensing office":
    "City Business Permit and Licensing Office",
  "city planning and development office / zoning office":
    "City Planning and Development Office / Zoning Office",
  "zoning office": "City Planning and Development Office / Zoning Office",
  "bogo city police station / pnp": "Bogo City Police Station / PNP",
  pnp: "Bogo City Police Station / PNP",
  "bfp bogo city fire station": "BFP Bogo City Fire Station",
  bfp: "BFP Bogo City Fire Station",
};

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

  return partial || null;
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
  const deptKey = normalizeOfficeKey(department);
  if (!deptKey) return false;

  return parseAssignedOffices(assignedOffice).some((part) => {
    const canonical = findCanonicalOffice(part);
    return canonical && normalizeOfficeKey(canonical) === deptKey;
  });
}

export function complaintAppliesToDepartment(
  assignedOffice,
  category,
  department
) {
  const deptKey = normalizeOfficeKey(department);
  if (!deptKey) return false;

  if (assignedOfficeIncludesDepartment(assignedOffice, department)) {
    return true;
  }

  const normalizedCategory = normalizeComplaintCategory(category);
  const relatedOffices = DEPARTMENTS_BY_CATEGORY[normalizedCategory] || [];
  const relatedKeys = new Set(
    relatedOffices.map((office) => normalizeOfficeKey(office))
  );

  if (!relatedKeys.has(deptKey)) {
    return false;
  }

  const assignedKeys = parseAssignedOffices(assignedOffice)
    .map((part) => findCanonicalOffice(part))
    .filter(Boolean)
    .map((office) => normalizeOfficeKey(office));

  if (assignedKeys.length === 0) {
    return true;
  }

  return assignedKeys.some((key) => relatedKeys.has(key));
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
  {
    category: "Tax and Treasury Concerns",
    keywords: [
      "tax",
      "treasury",
      "treasurer",
      "real property tax",
      "business tax",
      "payment",
      "receipt",
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
    ],
  },
  {
    category: "Business Permit and Licensing Concerns",
    keywords: [
      "business permit",
      "mayor's permit",
      "mayors permit",
      "licensing",
      "bplo",
      "business license",
    ],
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

export function getAssignedOffice(category, existingOffice = null) {
  const clean = String(existingOffice || "").replace(/\s+/g, " ").trim();
  const offices = getAssignedOffices(category, existingOffice);

  if (offices.length > 0) {
    return formatAssignedOffices(offices);
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
  if (lower.includes("tax") || lower.includes("treasury")) return "cash-outline";
  if (lower.includes("assessment") || lower.includes("assessor")) {
    return "home-outline";
  }
  if (lower.includes("civil registry") || lower.includes("registrar")) {
    return "document-outline";
  }
  if (lower.includes("business permit") || lower.includes("licensing")) {
    return "briefcase-outline";
  }

  return "document-text-outline";
}

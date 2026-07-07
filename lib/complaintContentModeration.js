const PROFANITY_TERMS = [
  "fuck",
  "fucking",
  "fucker",
  "shit",
  "bitch",
  "bastard",
  "asshole",
  "damn",
  "dumbass",
  "motherfucker",
  "puta",
  "putang",
  "putaang",
  "gago",
  "gaga",
  "tangina",
  "tarantado",
  "buang",
  "yawa",
  "piste",
  "pisti",
  "ulol",
  "tanga",
  "bobo",
  "inutil",
  "hayop",
  "pokpok",
  "linti",
  "pakyu",
  "fck",
  "fuk",
  "sh1t",
];

const OUT_OF_SCOPE_TERMS = [
  "trip lang",
  "tripping",
  "trip ra",
  "joke lang",
  "joke ra",
  "prank",
  "fake complaint",
  "testing lang",
  "test lang",
  "test complaint",
  "dili seryoso",
  "wala lang",
  "walay kapusungan",
  "walay labot",
  "way labot",
  "way kapusungan",
  "ignore this",
  "sample complaint",
  "dummy complaint",
  "boyfriend",
  "girlfriend",
  "ex nako",
  "selos lang",
  "break up",
  "breakup",
  "cheating",
  "nag usab mi",
  "away mi",
  "personal lang",
  "private matter",
  "gossip",
  "tsismis lang",
];

const LGU_SCOPE_HINTS = [
  "road",
  "street",
  "water",
  "tubig",
  "electric",
  "kuryente",
  "garbage",
  "basura",
  "flood",
  "baha",
  "drainage",
  "streetlight",
  "poste",
  "traffic",
  "fire",
  "sunog",
  "police",
  "health",
  "clinic",
  "animal",
  "dog",
  "market",
  "port",
  "bridge",
  "sidewalk",
  "complaint",
  "report",
  "damage",
  "broken",
  "leak",
  "pothole",
  "barangay",
  "lgu",
  "city",
  "bogo",
  "emergency",
  "rescue",
  "accident",
  "infrastructure",
  "environment",
  "sanitation",
];

function normalizeModerationText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTerm(text, terms = []) {
  const normalized = normalizeModerationText(text);

  if (!normalized) {
    return false;
  }

  return terms.some((term) => {
    const normalizedTerm = normalizeModerationText(term);

    if (!normalizedTerm) {
      return false;
    }

    if (normalizedTerm.includes(" ")) {
      return normalized.includes(normalizedTerm);
    }

    const pattern = new RegExp(
      `\\b${normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    return pattern.test(normalized);
  });
}

function mentionsLguConcern(title = "", description = "") {
  const combined = normalizeModerationText(`${title} ${description}`);
  return LGU_SCOPE_HINTS.some((term) => combined.includes(normalizeModerationText(term)));
}

export function detectProfanity(title = "", description = "") {
  return containsTerm(`${title} ${description}`, PROFANITY_TERMS);
}

export function detectOutOfScopeComplaint(title = "", description = "") {
  const combined = `${title} ${description}`;

  if (containsTerm(combined, OUT_OF_SCOPE_TERMS)) {
    return true;
  }

  const normalized = normalizeModerationText(combined);

  if (normalized.length < 8) {
    return true;
  }

  if (!mentionsLguConcern(title, description)) {
    const looksPersonalOnly =
      /\b(boyfriend|girlfriend|crush|ex|selos|usab|away sa|hate|love|dating)\b/i.test(
        combined
      );

    if (looksPersonalOnly) {
      return true;
    }
  }

  return false;
}

export function getModerationUserMessage(reason) {
  if (reason === "profanity") {
    return "Please remove profanity or harsh language from your complaint title and description before submitting.";
  }

  if (reason === "out_of_scope") {
    return "CitiSense only accepts legitimate Bogo City LGU concerns such as roads, utilities, safety, health, environment, and public services. Personal, joke, or non-LGU reports cannot be processed.";
  }

  if (reason === "both") {
    return "Please revise your complaint. Remove harsh language and report only a valid Bogo City LGU concern.";
  }

  return "This complaint cannot be processed. Please submit a valid Bogo City LGU concern using respectful language.";
}

export function validateComplaintContentLocally(title = "", description = "") {
  const hasProfanity = detectProfanity(title, description);
  const isOutOfScope = detectOutOfScopeComplaint(title, description);

  if (hasProfanity && isOutOfScope) {
    return {
      allowed: false,
      rejected: true,
      rejection_reason: "both",
      rejection_message: getModerationUserMessage("both"),
      moderation: {
        is_allowed: false,
        contains_profanity: true,
        is_out_of_scope: true,
        block_reason: "both",
      },
    };
  }

  if (hasProfanity) {
    return {
      allowed: false,
      rejected: true,
      rejection_reason: "profanity",
      rejection_message: getModerationUserMessage("profanity"),
      moderation: {
        is_allowed: false,
        contains_profanity: true,
        is_out_of_scope: false,
        block_reason: "profanity",
      },
    };
  }

  if (isOutOfScope) {
    return {
      allowed: false,
      rejected: true,
      rejection_reason: "out_of_scope",
      rejection_message: getModerationUserMessage("out_of_scope"),
      moderation: {
        is_allowed: false,
        contains_profanity: false,
        is_out_of_scope: true,
        block_reason: "out_of_scope",
      },
    };
  }

  return {
    allowed: true,
    rejected: false,
    moderation: {
      is_allowed: true,
      contains_profanity: false,
      is_out_of_scope: false,
      block_reason: null,
    },
  };
}

export function normalizeAiModerationResult(moderation = {}) {
  const containsProfanity = Boolean(moderation.contains_profanity);
  const isOutOfScope = Boolean(moderation.is_out_of_scope);
  const isAllowed =
    moderation.is_allowed !== false && !containsProfanity && !isOutOfScope;

  let blockReason = moderation.block_reason || null;

  if (!isAllowed && !blockReason) {
    if (containsProfanity && isOutOfScope) {
      blockReason = "both";
    } else if (containsProfanity) {
      blockReason = "profanity";
    } else if (isOutOfScope) {
      blockReason = "out_of_scope";
    } else {
      blockReason = "out_of_scope";
    }
  }

  return {
    is_allowed: isAllowed,
    contains_profanity: containsProfanity,
    is_out_of_scope: isOutOfScope,
    block_reason: blockReason,
    user_message:
      moderation.user_message ||
      (!isAllowed ? getModerationUserMessage(blockReason) : null),
  };
}

export function buildRejectedComplaintAnalysis({
  reason = "out_of_scope",
  message,
  source = "moderation",
}) {
  return {
    allowed: false,
    rejected: true,
    rejection_reason: reason,
    rejection_message: message || getModerationUserMessage(reason),
    moderation: {
      is_allowed: false,
      contains_profanity: reason === "profanity" || reason === "both",
      is_out_of_scope: reason === "out_of_scope" || reason === "both",
      block_reason: reason,
      user_message: message || getModerationUserMessage(reason),
    },
    source,
  };
}

export function isComplaintAnalysisRejected(analysis) {
  return Boolean(analysis?.rejected || analysis?.allowed === false);
}

export function getComplaintRejectionMessage(analysis) {
  return (
    analysis?.rejection_message ||
    analysis?.moderation?.user_message ||
    getModerationUserMessage(analysis?.rejection_reason || "out_of_scope")
  );
}

export const MODERATION_PROMPT_RULES = `Content moderation rules (must enforce before any other analysis):
- CitiSense only accepts legitimate Bogo City LGU public-service complaints.
- Reject complaints with profanity, insults, slurs, harsh language, or abusive wording in any Philippine language.
- Reject joke reports, pranks, trippings, fake/test complaints, personal relationship drama, gossip, or concerns outside LGU scope.
- Valid complaints involve public roads, utilities, safety, health, sanitation, environment, infrastructure, disasters, traffic, city facilities, or similar LGU services in Bogo City.
- If rejected, set moderation.is_allowed to false and do not classify the complaint.
- Provide a polite moderation.user_message explaining why the report was rejected.`;

export const MODERATION_JSON_SHAPE = `"moderation": {
    "is_allowed": boolean,
    "contains_profanity": boolean,
    "is_out_of_scope": boolean,
    "block_reason": "profanity | out_of_scope | both | null",
    "user_message": "polite explanation for the citizen, or null when allowed"
  },`;

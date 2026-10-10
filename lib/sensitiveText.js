// Rules that decide whether OCR text is confidential personal information.

// ===== License plates (PH format: 2-3 letters, optional space, 3-4 digits) =====
const PLATE_PATTERN = /^[A-Z]{2,3} ?[0-9]{3,4}$/;
const DIGIT_TO_LETTER = { 0: "O", 1: "I", 5: "S", 8: "B", 2: "Z", 6: "G" };
const LETTER_TO_DIGIT = { O: "0", Q: "0", D: "0", I: "1", L: "1", S: "5", B: "8", Z: "2", G: "6" };

function cleanPlateText(text) {
  return String(text || "")
    .toUpperCase()
    .replace(/[-_.·•|]/g, " ")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePlateText(text) {
  const cleaned = cleanPlateText(text);
  if (!cleaned) return null;

  if (PLATE_PATTERN.test(cleaned)) {
    const letters = cleaned.match(/^[A-Z]+/)[0];
    return `${letters} ${cleaned.slice(letters.length).trim()}`;
  }

  const compact = cleaned.replace(/ /g, "");
  if (compact.length < 5 || compact.length > 7) return null;
  if (/\d/.test(compact[0]) && !(compact[0] in DIGIT_TO_LETTER)) return null;

  for (const lettersLen of [3, 2]) {
    const letters = compact.slice(0, lettersLen);
    const digits = compact.slice(lettersLen);
    if (digits.length < 3 || digits.length > 4) continue;
    const fixedLetters = [...letters].map((ch) => DIGIT_TO_LETTER[ch] || ch).join("");
    const fixedDigits = [...digits].map((ch) => LETTER_TO_DIGIT[ch] || ch).join("");
    const candidate = `${fixedLetters} ${fixedDigits}`;
    // Pure numbers or words must not be "corrected" into plates.
    if (PLATE_PATTERN.test(candidate) && /[A-Z]/.test(letters) && /\d/.test(digits)) {
      return candidate;
    }
  }
  return null;
}

// ===== Contact details =====
// OCR often drops the dot ("juan@emailcom"), so the domain dot is optional.
const EMAIL = /[\w.+-]{2,}\s?@\s?[\w-]{3,}(\.[\w-]+)*/i;
const MOBILE = /(\+?63|0)[\s.-]?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/;
const LANDLINE = /\(?0\d{1,3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

// ===== Government IDs =====
const ID_LABEL =
  /\b(TIN|SSS|GSIS|PHIL\s?HEALTH|PAG[\s-]?IBIG|HDMF|UMID|CRN|PSN|PHIL\s?SYS|PASSPORT|LICEN[CS]E|LIC\.?\s?NO|DL\s?NO|ID\s?NO|ID\s?NUMBER|VOTER'?S?\s?ID|PRC)\b/i;
const ID_FORMATS = [
  /\b\d{3}[\s-]\d{3}[\s-]\d{3}([\s-]\d{3,5})?\b/, // TIN
  /\b\d{2}[\s-]\d{7}[\s-]\d\b/, // SSS
  /\b\d{2}[\s-]\d{9}[\s-]\d\b/, // PhilHealth
  /\b\d{4}[\s-]\d{4}[\s-]\d{4}([\s-]\d{4})?\b/, // Pag-IBIG / PhilSys PSN / UMID CRN
  /\b[A-Z]\d{2}[\s-]\d{2}[\s-]\d{6}\b/, // Driver's license
  /\b[A-Z]{1,2}\d{7}[A-Z]?\b/, // Passport
];

// ===== Dates =====
const BIRTH_LABEL =
  /\b(birth\s?date|date\s?of\s?birth|birthday|b[\s-]?day|dob|kaadlawon|petsa\s?ng\s?kapanganakan|born)\b/i;
const MONTHS = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = new RegExp(
  `\\b(\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}[/.-]\\d{1,2}[/.-]\\d{1,2}|${MONTHS}\\s\\d{1,2},?\\s\\d{4}|\\d{1,2}\\s${MONTHS}\\s\\d{4})\\b`,
  "i"
);

// ===== Addresses =====
const ADDRESS_LABEL = /\b(address|addr|tirahan|residence|home\s?address|permanent\s?address)\b/i;
const ADDRESS_UNIT = /\b(purok|sitio|zone|blk|block|lot|phase|unit|house\s?no|bldg)\.?\s*#?\s*\d+/i;
const ADDRESS_STREET =
  /(#\s?\d+|\b\d+[A-Z]?)\s+[A-Za-z][\w.' ]*\b(st|street|ave|avenue|road|rd|drive|dr|lane|ln|extension|ext)\b\.?/i;
const ADDRESS_LOCALITY = /\b(brgy|barangay|bgy)\.?\s+[A-Za-z]/i;

// ===== Names =====
const NAME_LABEL =
  /\b(name|full\s?name|pangalan|ngalan|signature|pirma|complainant|reported\s?by|owner|driver)\b\s*[:-]?/i;
const TITLE = /^(mr|mrs|ms|miss|atty|dr|engr|hon|sgt|sps)\.?$/i;
const PARTICLES = new Set([
  "de", "dela", "del", "delos", "la", "los", "san", "santa", "sta", "sto", "y", "jr", "sr", "ii", "iii",
]);
// Words that appear on signs, stores, and offices, not in personal names.
const PUBLIC_WORDS = new Set([
  "city", "hall", "office", "parking", "no", "street", "road", "avenue", "market", "public",
  "school", "church", "barangay", "brgy", "municipal", "government", "republic", "philippines",
  "department", "store", "pharmacy", "bank", "sale", "open", "closed", "welcome", "bogo",
  "cebu", "police", "station", "fire", "health", "center", "terminal", "bus", "stop", "drive",
  "slow", "danger", "caution", "exit", "entrance", "complaint", "form", "report", "date",
  "national", "highway", "plaza", "port", "water", "district", "electric", "cooperative",
  "services", "hospital", "clinic", "mall", "hotel", "restaurant", "food", "the", "of", "and",
  "for", "to", "in", "at", "on", "with", "by", "from", "please", "thank", "you", "keep", "clean",
  "area", "zone", "only", "not", "do", "free", "new", "old", "north", "south", "east", "west",
]);
const NAME_TOKEN = /^[A-Z][a-zA-Z'ñÑ-]+$/;
const INITIAL = /^[A-Z]\.$/;

function looksLikeName(text) {
  const tokens = text.trim().replace(/,$/, "").split(/\s+/).filter(Boolean);
  if (tokens.length && TITLE.test(tokens[0])) return tokens.length >= 2;
  if (tokens.length < 2 || tokens.length > 5) return false;
  const lowered = tokens.map((t) => t.toLowerCase().replace(/^[.,]+|[.,]+$/g, ""));
  if (lowered.some((word) => PUBLIC_WORDS.has(word))) return false;
  if (/\d/.test(text)) return false;

  const hasInitial = tokens.some((t) => INITIAL.test(t));
  const hasParticle = lowered.slice(1).some((word) => PARTICLES.has(word));
  const nameLike = tokens.filter(
    (t) => NAME_TOKEN.test(t) || INITIAL.test(t) || PARTICLES.has(t.toLowerCase())
  );
  if (nameLike.length !== tokens.length) return false;

  // Signs are usually ALL CAPS, so an unlabeled ALL CAPS phrase needs a
  // strong name signal (middle initial or Filipino surname particle).
  if (text.toUpperCase() === text) return hasInitial || hasParticle;
  return true;
}

const result = (type, value) => ({ type, sensitive: true, value });
const NOT_SENSITIVE = { type: null, sensitive: false };

/** Classify one OCR text. Checks the most specific patterns first. */
export function checkSensitiveInformation(text) {
  const raw = String(text || "").trim();
  if (!raw) return NOT_SENSITIVE;

  let match = raw.match(EMAIL);
  if (match) return result("email", match[0]);

  match = raw.match(MOBILE) || raw.match(LANDLINE);
  if (match) return result("phone_number", match[0]);

  if (ID_LABEL.test(raw) && /\d{3,}/.test(raw)) return result("government_id", raw);
  for (const pattern of ID_FORMATS) {
    match = raw.match(pattern);
    if (match) return result("government_id", match[0]);
  }

  const dateMatch = raw.match(DATE);
  if (BIRTH_LABEL.test(raw) && (dateMatch || /\d/.test(raw))) return result("birth_date", raw);
  if (dateMatch) return result("date", dateMatch[0]);

  const plate = normalizePlateText(raw);
  if (plate) return result("license_plate", plate);

  if (ADDRESS_LABEL.test(raw) && raw.replace(ADDRESS_LABEL, "").replace(/^[\s:-]+|[\s:-]+$/g, "").length > 2) {
    return result("address", raw);
  }
  if (ADDRESS_UNIT.test(raw) || ADDRESS_STREET.test(raw) || ADDRESS_LOCALITY.test(raw)) {
    return result("address", raw);
  }

  const label = raw.match(NAME_LABEL);
  if (label) {
    const value = raw.slice(label.index + label[0].length).replace(/^[\s:-]+|[\s:-]+$/g, "");
    if (value && !/\d/.test(value)) return result("name", value);
  }
  if (looksLikeName(raw)) return result("name", raw);

  return NOT_SENSITIVE;
}

const LABEL_ONLY = [
  ["name", /^\s*(name|full\s?name|pangalan|ngalan|signature|pirma|complainant)\s*[:-]?\s*$/i],
  ["address", /^\s*(address|addr|tirahan|residence)\s*[:-]?\s*$/i],
  ["birth_date", /^\s*(birth\s?date|date\s?of\s?birth|birthday|dob)\s*[:-]?\s*$/i],
  ["phone_number", /^\s*(phone|mobile|cell|contact|tel)(\s?no\.?)?\s*[:-]?\s*$/i],
  ["email", /^\s*e[\s-]?mail\s*[:-]?\s*$/i],
  ["government_id", /^\s*(TIN|SSS|GSIS|PHILHEALTH|PAG[\s-]?IBIG|UMID|ID\s?NO)\.?\s*[:-]?\s*$/i],
];

/** For a bare field label ("Name:", "TIN:") return the type of the value after it. */
export function detectLabel(text) {
  const value = String(text || "");
  const hit = LABEL_ONLY.find(([, pattern]) => pattern.test(value));
  return hit ? hit[0] : null;
}

// ===== Region logic (boxes are {x0, y0, x1, y1} in pixels) =====

function valueAfterLabel(label, lines) {
  const height = Math.max(1, label.y1 - label.y0);
  let best = null;
  let bestGap = null;
  for (const line of lines) {
    if (line === label) continue;
    const sameLine = Math.abs((label.y0 + label.y1) / 2 - (line.y0 + line.y1) / 2) < 0.6 * height;
    const gap = line.x0 - label.x1;
    if (sameLine && gap >= -0.3 * height && gap <= 8 * height && (bestGap === null || gap < bestGap)) {
      best = line;
      bestGap = gap;
    }
  }
  return best;
}

/** OCR often splits a plate into "ABC" + "1234"; build combined candidates. */
function mergeAdjacent(lines, maxGapRatio = 1.2) {
  const combined = [];
  for (const left of lines) {
    const lh = Math.max(1, left.y1 - left.y0);
    for (const right of lines) {
      if (left === right) continue;
      const rh = Math.max(1, right.y1 - right.y0);
      const sameLine = Math.abs((left.y0 + left.y1) / 2 - (right.y0 + right.y1) / 2) < 0.5 * Math.min(lh, rh);
      const similarSize = lh / rh > 0.6 && lh / rh < 1.6;
      const gap = right.x0 - left.x1;
      if (sameLine && similarSize && gap >= -0.5 * lh && gap <= maxGapRatio * lh) {
        combined.push({
          text: `${left.text} ${right.text}`,
          confidence: Math.min(left.confidence, right.confidence),
          x0: Math.min(left.x0, right.x0),
          y0: Math.min(left.y0, right.y0),
          x1: Math.max(left.x1, right.x1),
          y1: Math.max(left.y1, right.y1),
        });
      }
    }
  }
  return combined;
}

/**
 * Returns the OCR lines that must be blurred. Plate text must meet
 * `plateThreshold` (spec: 0.70); other personal data uses `piiThreshold`.
 */
export function findSensitiveText(lines, { plateThreshold = 0.7, piiThreshold = 0.4 } = {}) {
  const found = [];
  const add = (line, type) => {
    const threshold = type === "license_plate" ? plateThreshold : piiThreshold;
    if (line.confidence >= threshold) found.push({ ...line, type });
  };

  for (const line of lines) {
    const info = checkSensitiveInformation(line.text);
    if (info.sensitive) {
      add(line, info.type);
      continue;
    }
    const labelType = detectLabel(line.text);
    if (labelType) {
      const value = valueAfterLabel(line, lines);
      if (value) add(value, labelType);
    }
  }

  for (const pair of mergeAdjacent(lines)) {
    const info = checkSensitiveInformation(pair.text);
    if (info.sensitive && info.type === "license_plate") add(pair, info.type);
  }
  return found;
}

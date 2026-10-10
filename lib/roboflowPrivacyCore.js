import { findSensitiveText } from "./sensitiveText.js";

// Roboflow Workflow "citisense-privacy" (workspace mary-jennyrose-bracero).
// Steps: SAM3 (face / head / ID card), license plate model, EasyOCR.
export const WORKFLOW_URL =
  "https://serverless.roboflow.com/infer/workflows/mary-jennyrose-bracero/citisense-privacy";
const REQUEST_TIMEOUT_MS = 45000;

// SAM3 classes -> blur kind and minimum confidence (tuned on the test photos).
// "head" also catches side views, hats, and turned faces that "face" misses.
// The Workflow's SAM3 step must use confidence <= 0.2 so these apply.
const SAM3_CLASSES = {
  face: { kind: "face", minConfidence: 0.2 },
  head: { kind: "face", minConfidence: 0.3 },
  "ID card": { kind: "id_card", minConfidence: 0.45 },
};

// Extra margin around each box so edges of a face/plate/text are covered too.
const PADDING = { face: 0.2, license_plate: 0.15, id_card: 0.05, text: 0.12 };

async function runWorkflow(base64, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(WORKFLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        inputs: { image: { type: "base64", value: base64 } },
      }),
      signal: controller.signal,
    });
    const body = await response.text();
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
    if (!response.ok || !json?.outputs?.[0]) {
      const detail = json?.message || json?.detail || json?.error || body.slice(0, 160);
      throw new Error(
        `Roboflow HTTP ${response.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
      );
    }
    return json.outputs[0];
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Roboflow took too long to respond.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function overlapRatio(a, b) {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const smaller = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
  return smaller > 0 ? (ix * iy) / smaller : 0;
}

/** "face" and "head" hit the same person; merge heavily overlapping boxes. */
function mergeOverlapping(boxes) {
  const merged = [];
  for (const box of boxes) {
    const hit = merged.find((m) => overlapRatio(m, box) > 0.5);
    if (hit) {
      hit.x0 = Math.min(hit.x0, box.x0);
      hit.y0 = Math.min(hit.y0, box.y0);
      hit.x1 = Math.max(hit.x1, box.x1);
      hit.y1 = Math.max(hit.y1, box.y1);
    } else {
      merged.push({ ...box });
    }
  }
  return merged;
}

function centerToBox(p) {
  return {
    x0: p.x - p.width / 2,
    y0: p.y - p.height / 2,
    x1: p.x + p.width / 2,
    y1: p.y + p.height / 2,
  };
}

function validPredictions(output) {
  return (output?.predictions || []).filter((p) => p.width > 2 && p.height > 2);
}

function toRegion(box, kind, width, height, source) {
  const pad = PADDING[kind] ?? PADDING.text;
  const padX = (box.x1 - box.x0) * pad;
  const padY = (box.y1 - box.y0) * pad;
  const x0 = Math.max(0, box.x0 - padX);
  const y0 = Math.max(0, box.y0 - padY);
  const x1 = Math.min(width, box.x1 + padX);
  const y1 = Math.min(height, box.y1 + padY);
  return {
    x: x0 / width,
    y: y0 / height,
    w: (x1 - x0) / width,
    h: (y1 - y0) / height,
    label: kind,
    source,
  };
}

/**
 * Finds faces, license plates, and confidential text in a base64 JPEG with
 * the Roboflow Workflow. Returns normalized {x, y, w, h} regions.
 * `width`/`height` must be the pixel size of the image that was sent.
 */
export async function detectPrivateRegions(base64, apiKey, { width, height } = {}) {
  if (!apiKey) throw new Error("Missing EXPO_PUBLIC_ROBOFLOW_API_KEY.");
  if (!width || !height) throw new Error("Photo size is required for blurring.");

  const output = await runWorkflow(base64, apiKey);

  const boxesByKind = { face: [], id_card: [] };
  for (const p of validPredictions(output.people_and_ids)) {
    const rule = SAM3_CLASSES[p.class] || SAM3_CLASSES.face;
    if ((Number(p.confidence) || 0) >= rule.minConfidence) {
      boxesByKind[rule.kind].push(centerToBox(p));
    }
  }
  const faces = mergeOverlapping(boxesByKind.face);
  const idCards = mergeOverlapping(boxesByKind.id_card);
  const plates = validPredictions(output.plates);

  const regions = [];
  for (const box of faces) regions.push(toRegion(box, "face", width, height, "sam3"));
  for (const box of idCards) regions.push(toRegion(box, "id_card", width, height, "sam3"));
  for (const p of plates) {
    regions.push(toRegion(centerToBox(p), "license_plate", width, height, "plate_model"));
  }

  const lines = validPredictions(output.ocr)
    .filter((p) => p.class)
    .map((p) => ({ text: String(p.class), confidence: Number(p.confidence) || 0, ...centerToBox(p) }));
  const sensitiveText = findSensitiveText(lines);
  for (const line of sensitiveText) {
    const kind = line.type === "license_plate" ? "license_plate" : "text";
    regions.push({ ...toRegion(line, kind, width, height, "ocr"), textType: line.type, text: line.text });
  }

  return {
    regions,
    report: {
      faces: faces.length,
      idCards: idCards.length,
      plates: plates.length,
      ocrLines: lines.length,
      sensitiveText: sensitiveText.map((l) => ({ type: l.type, text: l.text, confidence: l.confidence })),
    },
  };
}

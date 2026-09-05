const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Prefer free-tier Flash models. Fall back when a model is unavailable or rate-limited.
const DEFAULT_MODEL =
  process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const MODEL_FALLBACKS = [
  DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.6-flash",
].filter((model, index, list) => model && list.indexOf(model) === index);

function readExtraPublicKey(name) {
  try {
    // Lazy require so Node/scripts importing this file still work.
    const Constants = require("expo-constants").default;
    const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
    return String(extra?.[name] || "").trim();
  } catch {
    return "";
  }
}

export function getGeminiApiKey() {
  const raw = (
    GEMINI_API_KEY?.trim() ||
    process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() ||
    readExtraPublicKey("EXPO_PUBLIC_GEMINI_API_KEY") ||
    ""
  );
  if (!raw) return "";

  // Guard against accidental env concatenation in build configs.
  const cut = raw.search(/-EXPO_PUBLIC_/);
  return cut > 0 ? raw.slice(0, cut).trim() : raw;
}

export function getGeminiModelFallbacks(preferredModel = DEFAULT_MODEL) {
  return [
    preferredModel,
    ...MODEL_FALLBACKS.filter((model) => model !== preferredModel),
  ];
}

export function buildGeminiGenerateUrl(model = DEFAULT_MODEL) {
  return `${GEMINI_BASE_URL}/models/${model}:generateContent`;
}

export function isQuotaOrRateLimitError(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("quota") ||
    text.includes("rate limit") ||
    text.includes("resource_exhausted") ||
    text.includes("429") ||
    text.includes("exceeded your current quota") ||
    text.includes("too many requests") ||
    text.includes("resource has been exhausted")
  );
}

export function isRetryableModelError(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    isQuotaOrRateLimitError(text) ||
    text.includes("not found") ||
    text.includes("is not supported") ||
    text.includes("model_not_found") ||
    text.includes("unavailable") ||
    text.includes("overloaded") ||
    text.includes("503") ||
    text.includes("500")
  );
}

export async function parseGeminiHttpResponse(response) {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error("Gemini API returned an empty response.");
  }

  if (trimmed.startsWith("<")) {
    throw new Error(
      "Gemini API returned HTML instead of JSON. Verify your API key and model access."
    );
  }

  let payload;

  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new Error(
      `Gemini API returned invalid JSON: ${trimmed.slice(0, 180)}`
    );
  }

  if (!response.ok) {
    const statusBit = response.status ? ` (${response.status})` : "";
    throw new Error(
      `${payload?.error?.message || "Gemini API request failed."}${statusBit}`
    );
  }

  return payload;
}

async function callGeminiGenerateOnce({
  apiKey,
  model,
  parts,
  temperature,
  responseMimeType,
  maxOutputTokens,
  signal,
}) {
  const generationConfig = {
    temperature,
    responseMimeType,
    maxOutputTokens,
  };

  // Disable thinking so output tokens are not eaten and JSON stays complete.
  if (/gemini-(2\.5|3)/.test(String(model))) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const response = await fetch(buildGeminiGenerateUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig,
    }),
    signal,
  });

  const payload = await parseGeminiHttpResponse(response);
  const candidateParts = payload?.candidates?.[0]?.content?.parts || [];

  const answerParts = candidateParts.filter(
    (part) => typeof part?.text === "string" && part.text.trim() && !part.thought
  );
  const fallbackParts = candidateParts.filter(
    (part) => typeof part?.text === "string" && part.text.trim()
  );

  const responseText = (answerParts.length ? answerParts : fallbackParts)
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!responseText) {
    const blockReason =
      payload?.candidates?.[0]?.finishReason ||
      payload?.promptFeedback?.blockReason ||
      "unknown";
    throw new Error(`Gemini returned no analysis text (${blockReason}).`);
  }

  return { text: responseText, model };
}

export async function callGeminiGenerate({
  apiKey = getGeminiApiKey(),
  model = DEFAULT_MODEL,
  parts,
  temperature = 0.2,
  responseMimeType = "application/json",
  maxOutputTokens = 1600,
  timeoutMs = 22000,
}) {
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini request is missing content parts.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const modelsToTry = getGeminiModelFallbacks(model);

  let lastError = null;

  try {
    for (const candidateModel of modelsToTry) {
      try {
        const result = await callGeminiGenerateOnce({
          apiKey,
          model: candidateModel,
          parts,
          temperature,
          responseMimeType,
          maxOutputTokens,
          signal: controller.signal,
        });

        if (candidateModel !== model) {
          console.log(`Gemini fell back to model: ${candidateModel}`);
        }

        return result.text;
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Gemini analysis timed out.");
        }

        lastError = error;
        const message = error?.message || String(error);

        if (isRetryableModelError(message)) {
          console.log(
            `Gemini model ${candidateModel} unavailable (${message}). Trying backup model...`
          );
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("Gemini request failed on all backup models.");
  } finally {
    clearTimeout(timeoutId);
  }
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  let trimmed = String(text).trim();

  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  const direct = tryParseJson(trimmed);
  if (direct) {
    return direct;
  }

  const start = trimmed.indexOf("{");
  if (start < 0) {
    return null;
  }

  let slice = trimmed.slice(start);
  const parsedSlice = tryParseJson(slice);
  if (parsedSlice) {
    return parsedSlice;
  }

  // Best-effort repair for truncated JSON from model cutoffs.
  let inString = false;
  let escaped = false;
  const stack = [];

  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch === "{" ? "}" : "]");
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  let repaired = slice;
  if (inString) {
    repaired += '"';
  }

  repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/g, "");
  repaired = repaired.replace(/,\s*$/g, "");
  repaired = repaired.replace(/:\s*$/g, "");
  repaired = repaired.replace(/,\s*"[^"]+"\s*$/g, "");

  while (stack.length) {
    repaired += stack.pop();
  }

  return tryParseJson(repaired);
}

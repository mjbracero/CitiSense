const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function getGeminiApiKey() {
  return GEMINI_API_KEY?.trim() || "";
}

export function buildGeminiGenerateUrl(model = DEFAULT_MODEL) {
  return `${GEMINI_BASE_URL}/models/${model}:generateContent`;
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
    throw new Error(
      payload?.error?.message ||
        `Gemini API request failed with status ${response.status}.`
    );
  }

  return payload;
}

export async function callGeminiGenerate({
  apiKey = getGeminiApiKey(),
  model = DEFAULT_MODEL,
  parts,
  temperature = 0.2,
  responseMimeType = "application/json",
}) {
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini request is missing content parts.");
  }

  const response = await fetch(buildGeminiGenerateUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature,
        responseMimeType,
      },
    }),
  });

  const payload = await parseGeminiHttpResponse(response);

  const responseText = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!responseText) {
    throw new Error("Gemini returned no analysis text.");
  }

  return responseText;
}

export function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

import * as FileSystem from "expo-file-system/legacy";
import {
  callGeminiGenerate,
  getGeminiApiKey,
} from "./geminiApi";

function cleanTranscript(text = "") {
  return String(text || "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^(transcript|transcription|output|result)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BOGO_BARANGAYS = [
  "Anonang Norte",
  "Anonang Sur",
  "Banban",
  "Binabag",
  "Bungtod",
  "Carbon",
  "Cayang",
  "Cogon",
  "Dakit",
  "Don Pedro Rodriguez",
  "Gairan",
  "Guadalupe",
  "La Paz",
  "La Purisima Concepcion",
  "Libertad",
  "Lourdes",
  "Malingin",
  "Marangog",
  "Nailon",
  "Odlot",
  "Pandan",
  "Polambato",
  "Sambag",
  "San Vicente",
  "Santo Niño",
  "Santo Rosario",
  "Siocon",
  "Sudlonon",
  "Taytayan",
].join(", ");

function buildTranscriptionPrompt(field = "description") {
  if (field === "contact") {
    return `Transcribe this voice recording of a Philippine mobile number.

Rules:
- The speaker is saying digits for a phone number (usually 11 digits starting with 09).
- Return ONLY the digits they said, no spaces or words if possible.
- If they mixed words like "zero", "nine", "sero", "nuybe", convert to digits.
- Do not invent digits you did not hear.
- Return ONLY the number text.`;
  }

  const fieldHint =
    field === "title"
      ? "Format as a short complaint title (one clear line), still in the speaker's language."
      : "Format as a clear complaint description, still in the speaker's language.";

  return `You are an expert Cebuano/Bisaya speech-to-text system for CitiSense in Bogo City, Cebu, Philippines.

Goal: produce an ACCURATE verbatim transcript of what the citizen said.

PRIMARY language of this city: Cebuano / Bisaya (Binisaya).
Also common: English, Tagalog/Filipino, and mixed speech (Bislish / Taglish / Bisaya–English).

CRITICAL ACCURACY RULES FOR CEBUANO:
1. Transcribe EXACTLY what was spoken. Prefer authentic Cebuano/Bisaya words and spelling.
2. NEVER translate Cebuano into Tagalog or English. Keep the original language.
3. NEVER "correct" Bisaya into Tagalog. Examples of FORBIDDEN rewrites:
   - walay → walang
   - dili → hindi
   - guba / naguba / nadaot → sira
   - tubig → tubig (keep), but do not force Tagalog phrasing
   - kuryente / suga → do not rewrite as "kuryente/ilaw" Tagalog style unless spoken that way
   - dalan / kalsada → keep as spoken
   - tabang → do not force "tulong" unless spoken
4. Keep natural Bisaya particles and markers exactly: jud, gyud, ra, lang, ba, kay, unta, pud, sab, na, pa, bitaw, lagi, oy, bay.
5. Keep common Cebuano complaint vocabulary as spoken, for example:
   walay tubig, walay kuryente, walay suga, guba ang dalan, barado ang kanal, baha, lunop, basura, baho, abog, sunog, apoy, aso, nabangga, aksidente, nasamdan, natanggong, dili makagawas, poste, sira ang tubo, nabuak, naguba, perwisyo, samok, bagyo, huwaw, daghang basura, nagbaha, nalubog, gipangayo og tabang.
6. Keep place names accurate. Bogo City barangays include: ${BOGO_BARANGAYS}.
7. If the speaker mixed English or Tagalog words inside Bisaya, keep that mix. Do not normalize the whole sentence into one language.
8. If speech is unclear, choose the most likely Cebuano civic-complaint reading — do NOT invent new facts, locations, or damages.
9. Use light punctuation and capitalization for readability, but do not change meaning or language.
10. ${fieldHint}
11. Return ONLY the final transcript text. No quotes, labels, markdown, or explanations.`;
}

/**
 * Transcribe a recorded audio file with Gemini (Cebuano/Bisaya-first for Bogo City).
 */
export async function transcribeAudioWithGemini(
  uri,
  { field = "description", mimeType = "audio/wav" } = {}
) {
  if (!getGeminiApiKey()) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY.");
  }

  if (!uri) {
    throw new Error("No audio file to transcribe.");
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!base64) {
    throw new Error("Recorded audio was empty.");
  }

  const maxOutputTokens =
    field === "contact" ? 64 : field === "title" ? 220 : 640;

  const raw = await callGeminiGenerate({
    parts: [
      { text: buildTranscriptionPrompt(field) },
      {
        inline_data: {
          mime_type: mimeType,
          data: base64,
        },
      },
    ],
    temperature: 0,
    responseMimeType: "text/plain",
    maxOutputTokens,
    timeoutMs: 45000,
  });

  const transcript = cleanTranscript(raw);
  if (!transcript) {
    throw new Error("Gemini returned an empty transcript.");
  }

  return transcript;
}

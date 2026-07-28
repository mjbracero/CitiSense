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

function buildTranscriptionPrompt(field = "description") {
  if (field === "contact") {
    return `Transcribe this voice recording of a Philippine mobile number.

Rules:
- The speaker is saying digits for a phone number (usually 11 digits starting with 09).
- Return ONLY the digits they said, no spaces or words if possible.
- If they mixed words like "zero" or "nine", convert to digits.
- Do not invent digits you did not hear.
- Return ONLY the number text.`;
  }

  const fieldHint =
    field === "title"
      ? "Format as a short complaint title (one clear line)."
      : "Format as a clear complaint description.";

  return `You are an expert speech-to-text system for CitiSense in Bogo City, Cebu, Philippines.

Transcribe this citizen complaint recording with high accuracy.

PRIMARY languages (most common): Bisaya/Cebuano, Tagalog/Filipino, and English — including mixed speech (Bislish, Taglish, Bisaya–English).

Also accept ANY other Philippine dialect or regional speech if that is what was spoken (e.g. Hiligaynon/Ilonggo, Waray, Ilocano, Bikol, Kapampangan, or other local varieties). Do not reject or ignore speech just because it is not Bisaya/Tagalog/English.

Requirements:
1. Transcribe EXACTLY what was said — accurate words, names, and meaning.
2. Prefer correct Bisaya/Cebuano spelling when the speaker used Bisaya (e.g. walay, guba, dalan, tubig, kuryente, baha, sunog, kalsada, basura, tabang, nasamdan, perwisyo).
3. Keep Tagalog or English when that is what was spoken. Do NOT force-translate into another language.
4. If another PH dialect was used, transcribe it faithfully; you may lightly normalize spelling so it is readable, without changing meaning.
5. Fix grammar and punctuation so the transcript is clear, while keeping the original meaning.
6. Keep place names accurate (Bogo, barangay names, streets).
7. Do not invent details that were not spoken.
8. ${fieldHint}
9. Return ONLY the final transcript text. No quotes, labels, or explanations.`;
}

/**
 * Transcribe a recorded audio file with Gemini (ChatGPT-like accuracy for PH languages).
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

  const maxOutputTokens = field === "contact" ? 64 : field === "title" ? 180 : 480;

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
    temperature: 0.1,
    responseMimeType: "text/plain",
    maxOutputTokens,
    timeoutMs: 35000,
  });

  const transcript = cleanTranscript(raw);
  if (!transcript) {
    throw new Error("Gemini returned an empty transcript.");
  }

  return transcript;
}

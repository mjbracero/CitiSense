/**
 * Deepgram voice input for CitiSense (Bogo City / Philippines).
 * Main: Bisaya/Cebuano, Tagalog/Filipino, English (including mix).
 * Also accepts other PH dialects when spoken (via Tagalog model + keyterms).
 */

export const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";
export const DEEPGRAM_DEFAULT_MODE = "ph";
export const DEEPGRAM_VOICE_LABEL =
  "Bisaya / Tagalog / English (+ other PH dialects)";

const KEYTERMS = [
  // Places
  "Bogo",
  "Bogo City",
  "barangay",
  "Cebu",
  "Visayas",
  // Bisaya / Cebuano (main)
  "baha",
  "guba",
  "nadaot",
  "nalubog",
  "basura",
  "dalan",
  "kalsada",
  "tubig",
  "kuryente",
  "suga",
  "walay tubig",
  "walay kuryente",
  "walay suga",
  "tabang",
  "perwisyo",
  "samok",
  "kanal",
  "linog",
  "sunog",
  "nasunog",
  "apoy",
  "aso",
  "nabangga",
  "aksidente",
  "nasamdan",
  "natanggong",
  "dili makagawas",
  "poste",
  "sira ang",
  "barado ang",
  "naguba",
  "gipangayo",
  "pagtabang",
  "lunop",
  "bagyo",
  "huwaw",
  "abog",
  "baho",
  "daghan basura",
  // Tagalog / Filipino (main)
  "walang tubig",
  "walang kuryente",
  "walang ilaw",
  "sira",
  "tulong",
  "sakuna",
  "delikado",
  "ilaw",
  "kalye",
  "barado",
  "aksidente",
  "nasugatan",
  "sunog",
  "baha",
  "basura",
  "kanal",
  "poste",
  "kalsada",
  "nabangga",
  "nakulong",
  "mangyari",
  "reklamo",
  // English (main)
  "streetlight",
  "flooding",
  "garbage",
  "drainage",
  "power outage",
  "no water",
  "no electricity",
  "road damage",
  "emergency",
  "complaint",
  "landslide",
  "accident",
  "rescue",
  "trapped",
  "fire",
  "pothole",
  "broken pipe",
  // Other PH dialect / common mixed terms
  "wala tubig",
  "wara tubig",
  "indi makasulod",
  "guwa",
  "perwisyo jud",
  "please help",
];

export function getDeepgramApiKey() {
  const fromEnv = process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY?.trim() || "";
  if (fromEnv) return fromEnv;

  try {
    const Constants = require("expo-constants").default;
    const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
    return String(extra?.EXPO_PUBLIC_DEEPGRAM_API_KEY || "").trim();
  } catch {
    return "";
  }
}

export function buildDeepgramListenUrl({ mode = DEEPGRAM_DEFAULT_MODE } = {}) {
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    numerals: "true",
    filler_words: "false",
  });

  if (mode === "en") {
    params.set("language", "en");
  } else {
    // Tagalog model + Bisaya/PH keyterms — best Deepgram path for
    // Bisaya + Tagalog + English mix (no separate ceb code on Nova-3).
    params.set("language", "tl");
    for (const term of KEYTERMS) {
      params.append("keyterm", term);
    }
  }

  return `${DEEPGRAM_LISTEN_URL}?${params.toString()}`;
}

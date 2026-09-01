/**
 * Deepgram voice input for CitiSense (Bogo City / Philippines).
 * Fallback only — Gemini is preferred for accurate Cebuano/Bisaya.
 * Deepgram has no native ceb code; Tagalog model + Bisaya keyterms is the best fallback.
 */

export const DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen";
export const DEEPGRAM_DEFAULT_MODE = "ph";
export const DEEPGRAM_VOICE_LABEL =
  "Bisaya / Tagalog / English (+ other PH dialects)";

const KEYTERMS = [
  // Places — Bogo City
  "Bogo",
  "Bogo City",
  "barangay",
  "Cebu",
  "Visayas",
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
  // Cebuano / Bisaya — core complaint speech
  "walay",
  "dili",
  "guba",
  "naguba",
  "nadaot",
  "nabuak",
  "baha",
  "nagbaha",
  "lunop",
  "nalubog",
  "basura",
  "daghang basura",
  "dalan",
  "kalsada",
  "tubig",
  "kuryente",
  "suga",
  "walay tubig",
  "walay kuryente",
  "walay suga",
  "tabang",
  "pagtabang",
  "gipangayo",
  "perwisyo",
  "perwisyo jud",
  "samok",
  "kanal",
  "barado",
  "barado ang kanal",
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
  "tubo",
  "bagyo",
  "huwaw",
  "abog",
  "baho",
  "jud",
  "gyud",
  "unta",
  "pud",
  "sab",
  "bitaw",
  "lagi",
  "reklamo",
  "problema",
  "luoy",
  "delikado",
  "peligro",
  "tawag",
  "tabangi mi",
  "kinahanglan",
  "dugay na",
  "matag adlaw",
  "gabii",
  "buntag",
  // Tagalog / Filipino
  "walang tubig",
  "walang kuryente",
  "walang ilaw",
  "sira",
  "tulong",
  "sakuna",
  "ilaw",
  "kalye",
  "nasugatan",
  "nakulong",
  "mangyari",
  // English
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
    // No native cebuano code on Nova-3. Tagalog + Bisaya keyterms is the
    // best Deepgram fallback; Gemini remains primary for Cebuano accuracy.
    params.set("language", "tl");
    for (const term of KEYTERMS) {
      params.append("keyterm", term);
    }
  }

  return `${DEEPGRAM_LISTEN_URL}?${params.toString()}`;
}

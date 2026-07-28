const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

/**
 * Load `.env` into process.env for EAS + local config evaluation.
 * `.env` stays gitignored; `.easignore` allows EAS Build to upload it.
 */
function loadDotEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile();

function publicEnv(name) {
  return String(process.env[name] || "").trim();
}

module.exports = () => {
  const expo = appJson.expo || {};

  return {
    ...expo,
    extra: {
      ...(expo.extra || {}),
      EXPO_PUBLIC_GEMINI_API_KEY: publicEnv("EXPO_PUBLIC_GEMINI_API_KEY"),
      EXPO_PUBLIC_DEEPGRAM_API_KEY: publicEnv("EXPO_PUBLIC_DEEPGRAM_API_KEY"),
      EXPO_PUBLIC_MAPTILER_API_KEY: publicEnv("EXPO_PUBLIC_MAPTILER_API_KEY"),
    },
  };
};

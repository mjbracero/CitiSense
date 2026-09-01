import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { getGeminiApiKey } from "./geminiApi";
import { transcribeAudioWithGemini } from "./geminiVoiceTranscription";
import {
  buildDeepgramListenUrl,
  getDeepgramApiKey,
} from "./deepgramApi";
import { decode as decodeBase64 } from "base64-arraybuffer";

/** dB metering threshold — above this counts as speech */
const SPEECH_THRESHOLD_DB = -45;
/** How long silence must last after speech before auto-stop */
const SILENCE_TO_STOP_MS = 900;
/** Ignore silence until the user has spoken at least this long */
const MIN_SPEECH_MS = 280;
/** Don't auto-stop in the first moments after mic opens */
const START_GRACE_MS = 600;
/** Max recording length safety net */
const MAX_RECORDING_MS = 60000;
/** Backup poll when platform metering callbacks are sparse (common on Expo Go / Android) */
const METER_POLL_MS = 80;

/**
 * Higher-quality mono AAC — clearer Cebuano consonants for Gemini STT.
 * Metering stays enabled for silence auto-stop.
 */
const RECORDING_OPTIONS = {
  isMeteringEnabled: true,
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 192000,
  },
  ios: {
    extension: ".m4a",
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MAX,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 192000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 192000,
  },
};

function guessAudioMimeType(uri = "") {
  const lower = String(uri || "").toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "audio/mp4";
}

function normalizeMeterLevel(raw) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }

  // Some Android/Expo Go builds report 0..1 amplitude instead of dBFS.
  if (raw >= 0 && raw <= 1) {
    if (raw <= 0.0001) return -160;
    return Math.max(-160, Math.min(0, 20 * Math.log10(raw)));
  }

  // Already dBFS-ish
  return Math.max(-160, Math.min(0, raw));
}

/** expo-av allows only one Recording prepared globally */
let globalRecording = null;
let recorderChain = Promise.resolve();

function withRecorderLock(work) {
  const run = recorderChain.then(work, work);
  recorderChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function unloadRecordingInstance(instance) {
  if (!instance) return null;

  let uri = null;
  try {
    instance.setOnRecordingStatusUpdate?.(null);
  } catch {
    // ignore
  }

  try {
    uri = instance.getURI?.() || null;
  } catch {
    // ignore
  }

  try {
    const status = await instance.getStatusAsync();
    if (status?.isRecording) {
      await instance.stopAndUnloadAsync();
    } else if (status?.canRecord || status?.isDoneRecording) {
      await instance.stopAndUnloadAsync();
    } else {
      await instance.stopAndUnloadAsync();
    }
  } catch {
    try {
      await instance.stopAndUnloadAsync();
    } catch {
      // already unloaded / never prepared
    }
  }

  try {
    uri = instance.getURI?.() || uri;
  } catch {
    // ignore
  }

  return uri;
}

async function releaseGlobalRecording() {
  const instance = globalRecording;
  globalRecording = null;
  return unloadRecordingInstance(instance);
}

function isRecorderBusyError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("only one recording") ||
    message.includes("recorder not prepared") ||
    message.includes("prepare encountered an error") ||
    message.includes("recording not prepared")
  );
}

async function createPreparedRecording(onStatusUpdate) {
  return withRecorderLock(async () => {
    await releaseGlobalRecording();
    // Let native audio settle after unload / mic beep.
    await wait(280);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Extra beat after mode switch — Expo Go is flaky here.
    await wait(150);

    const startRecording = async () => {
      const recording = new Audio.Recording();
      recording.setOnRecordingStatusUpdate(onStatusUpdate);
      recording.setProgressUpdateInterval(METER_POLL_MS);
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);
      await recording.startAsync();
      globalRecording = recording;
      return recording;
    };

    let lastError = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await startRecording();
      } catch (error) {
        lastError = error;
        console.log(`Recorder prepare attempt ${attempt + 1} failed:`, error);

        await releaseGlobalRecording();
        await wait(300 + attempt * 200);

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        if (!isRecorderBusyError(error) && attempt === 0) {
          // Still retry once for transient Expo Go failures.
          continue;
        }
      }
    }

    throw lastError || new Error("Unable to prepare microphone recorder.");
  });
}

async function deleteQuietly(uri) {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}

async function transcribeWithDeepgramFallback(uri, mode = "ph") {
  const apiKey = getDeepgramApiKey();
  if (!apiKey || !uri) {
    return "";
  }

  const url = buildDeepgramListenUrl({ mode });

  try {
    const uploaded = await FileSystem.uploadAsync(url, uri, {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": guessAudioMimeType(uri),
      },
    });
    const payload = JSON.parse(uploaded.body || "{}");
    if (uploaded.status >= 200 && uploaded.status < 300) {
      return (
        payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ||
        ""
      );
    }
  } catch (error) {
    console.log("Deepgram fallback upload error:", error);
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": guessAudioMimeType(uri),
      },
      body: decodeBase64(base64),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      return (
        payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ||
        ""
      );
    }
  } catch (error) {
    console.log("Deepgram fallback fetch error:", error);
  }

  return "";
}

/**
 * Continuous voice recording → auto-stop on silence → Gemini transcription.
 */
export function createVoiceTranscriber({
  field = "description",
  deepgramMode = "ph",
  onTranscript,
  onStatus,
  onError,
  onAutoStop,
} = {}) {
  let active = false;
  let stopping = false;
  let recording = null;
  let startedAt = 0;
  let hasSpoken = false;
  let speechStartedAt = 0;
  let silenceStartedAt = 0;
  let maxTimer = null;
  let meterPollTimer = null;
  let validMeterSamples = 0;

  const clearMaxTimer = () => {
    if (maxTimer) {
      clearTimeout(maxTimer);
      maxTimer = null;
    }
  };

  const clearMeterPoll = () => {
    if (meterPollTimer) {
      clearInterval(meterPollTimer);
      meterPollTimer = null;
    }
  };

  const cleanupRecording = async () => {
    clearMaxTimer();
    clearMeterPoll();

    const instance = recording;
    recording = null;

    let uri = null;
    await withRecorderLock(async () => {
      if (globalRecording === instance) {
        globalRecording = null;
      }
      uri = await unloadRecordingInstance(instance);

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
        });
      } catch {
        // ignore
      }
    });

    return uri;
  };

  const handleMetering = (status) => {
    if (!active || stopping) return;
    if (status && status.isRecording === false) return;

    const now = Date.now();
    if (now - startedAt < START_GRACE_MS) return;

    const level = normalizeMeterLevel(status?.metering);

    // No usable meter yet — wait; backup poll will keep trying.
    if (level == null) return;

    validMeterSamples += 1;

    if (level >= SPEECH_THRESHOLD_DB) {
      hasSpoken = true;
      silenceStartedAt = 0;
      if (!speechStartedAt) {
        speechStartedAt = now;
      }
      return;
    }

    if (!hasSpoken) return;

    if (!silenceStartedAt) {
      silenceStartedAt = now;
      return;
    }

    const silenceMs = now - silenceStartedAt;
    const speechMs = now - speechStartedAt;

    if (silenceMs >= SILENCE_TO_STOP_MS && speechMs >= MIN_SPEECH_MS) {
      stopping = true;
      clearMaxTimer();
      clearMeterPoll();
      onAutoStop?.();
    }
  };

  return {
    async start() {
      if (active || stopping) return;

      if (!getGeminiApiKey() && !getDeepgramApiKey()) {
        throw new Error(
          "Missing EXPO_PUBLIC_GEMINI_API_KEY (recommended) or EXPO_PUBLIC_DEEPGRAM_API_KEY."
        );
      }

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        const error = new Error("MICROPHONE_DENIED");
        error.code = "MICROPHONE_DENIED";
        throw error;
      }

      const next = await createPreparedRecording(handleMetering);
      recording = next;
      active = true;
      stopping = false;
      startedAt = Date.now();
      hasSpoken = false;
      speechStartedAt = 0;
      silenceStartedAt = 0;
      validMeterSamples = 0;

      clearMaxTimer();
      clearMeterPoll();
      // Backup poll — some Android devices rarely fire status callbacks.
      meterPollTimer = setInterval(() => {
        if (!recording || !active || stopping) return;
        recording
          .getStatusAsync()
          .then((status) => handleMetering(status))
          .catch(() => {});
      }, METER_POLL_MS);

      maxTimer = setTimeout(() => {
        if (active && !stopping) {
          stopping = true;
          clearMeterPoll();
          onAutoStop?.();
        }
      }, MAX_RECORDING_MS);

      onStatus?.("listening");
    },

    async stop() {
      if (!recording && !active) {
        return "";
      }

      stopping = true;
      active = false;
      clearMaxTimer();
      onStatus?.("transcribing");

      const uri = await cleanupRecording();
      if (!uri) {
        stopping = false;
        onStatus?.("idle");
        return "";
      }

      try {
        let transcript = "";

        if (getGeminiApiKey()) {
          try {
            transcript = await transcribeAudioWithGemini(uri, {
              field,
              mimeType: guessAudioMimeType(uri),
            });
          } catch (geminiError) {
            console.log("Gemini voice transcription error:", geminiError);
            transcript = await transcribeWithDeepgramFallback(uri, deepgramMode);
            if (!transcript) {
              throw geminiError;
            }
          }
        } else {
          transcript = await transcribeWithDeepgramFallback(uri, deepgramMode);
        }

        const cleaned = String(transcript || "").trim();
        if (cleaned) {
          onTranscript?.(cleaned);
        }

        onStatus?.("idle");
        return cleaned;
      } catch (error) {
        onError?.(error);
        onStatus?.("idle");
        throw error;
      } finally {
        stopping = false;
        await deleteQuietly(uri);
      }
    },
  };
}

/** @deprecated Prefer createVoiceTranscriber */
export function createDeepgramLiveTranscriber(options = {}) {
  return createVoiceTranscriber({
    field: options.mode === "en" ? "contact" : "description",
    deepgramMode: options.mode || "ph",
    onTranscript: options.onTranscript,
    onStatus: options.onStatus,
    onError: options.onError,
    onAutoStop: options.onAutoStop,
  });
}

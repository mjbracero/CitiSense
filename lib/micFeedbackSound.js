import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";

function bytesToBase64(bytes) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += chars[(triplet >> 18) & 63];
    output += chars[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? chars[triplet & 63] : "=";
  }
  return output;
}

function buildBeepWavBase64({
  frequency = 920,
  durationMs = 110,
  sampleRate = 22050,
  volume = 0.42,
} = {}) {
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / 180);
    const release = Math.min(1, (numSamples - i) / 500);
    const sample =
      Math.sin(2 * Math.PI * frequency * t) * volume * attack * release;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true);
  }

  return bytesToBase64(new Uint8Array(buffer));
}

let cachedBeepUri = null;

async function getBeepUri() {
  if (cachedBeepUri) {
    return cachedBeepUri;
  }

  const path = `${FileSystem.cacheDirectory}citisense-mic-beep.wav`;
  await FileSystem.writeAsStringAsync(path, buildBeepWavBase64(), {
    encoding: FileSystem.EncodingType.Base64,
  });
  cachedBeepUri = path;
  return path;
}

/**
 * Short confirmation beep + haptic when the mic is tapped.
 * Fully unloads the sound before returning so recording can start cleanly.
 */
export async function playMicStartFeedback() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // haptics unavailable on some devices
  }

  let sound = null;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    const uri = await getBeepUri();
    const created = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 0.85, isLooping: false }
    );
    sound = created.sound;

    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 220);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status?.didJustFinish || status?.isLoaded === false) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  } catch (error) {
    console.log("Mic start sound error:", error);
  } finally {
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {
        // ignore
      }
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
  }
}

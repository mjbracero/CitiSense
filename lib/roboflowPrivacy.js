import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { detectPrivateRegions } from "./roboflowPrivacyCore";

// Detection and blurring both use this one oriented, resized file, so every
// box shares its coordinate space.
const WORKING_MAX_SIDE = 1600;
const WORKING_QUALITY = 0.85;

function getRoboflowApiKey() {
  return String(
    process.env.EXPO_PUBLIC_ROBOFLOW_API_KEY ||
      Constants.expoConfig?.extra?.EXPO_PUBLIC_ROBOFLOW_API_KEY ||
      ""
  ).trim();
}

async function prepareWorkingPhoto(uri) {
  const oriented = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const longest = Math.max(oriented.width || 0, oriented.height || 0);
  const resize =
    longest > WORKING_MAX_SIDE
      ? [
          {
            resize:
              oriented.width >= oriented.height
                ? { width: WORKING_MAX_SIDE }
                : { height: WORKING_MAX_SIDE },
          },
        ]
      : [];

  const working = await ImageManipulator.manipulateAsync(oriented.uri, resize, {
    compress: WORKING_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const base64 = await FileSystem.readAsStringAsync(working.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { uri: working.uri, width: working.width, height: working.height, base64 };
}

/** Detects faces, plates, and confidential text; returns regions + the working photo. */
export async function detectConfidentialRegions(uri) {
  const apiKey = getRoboflowApiKey();
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_ROBOFLOW_API_KEY in .env.");
  }
  const photo = await prepareWorkingPhoto(uri);
  const { regions, report } = await detectPrivateRegions(photo.base64, apiKey, {
    width: photo.width,
    height: photo.height,
  });
  return { regions, report, photo };
}

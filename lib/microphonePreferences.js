import AsyncStorage from "@react-native-async-storage/async-storage";

const MIC_CONSENT_KEY = "citisense_microphone_consent_granted";

export async function hasMicrophoneConsent() {
  try {
    const stored = await AsyncStorage.getItem(MIC_CONSENT_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

export async function saveMicrophoneConsent(granted = true) {
  try {
    await AsyncStorage.setItem(MIC_CONSENT_KEY, granted ? "true" : "false");
  } catch (error) {
    console.log("Save microphone consent error:", error);
  }
}

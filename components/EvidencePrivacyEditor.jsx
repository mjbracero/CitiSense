import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "./AppWebView";
import { detectConfidentialRegions } from "../lib/roboflowPrivacy";
import { useHideBottomNav } from "./PersistentBottomNav";

// ===== [PRIVACY BLUR] HTML builder: canvas blur of detected regions (runs in hidden WebView) =====
function redactHtml(base64, regions) {
  const payload = JSON.stringify({ base64, regions });
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;background:rgba(0, 0, 0, 1)}</style>
</head>
<body>
<script>
(function () {
  var payload = ${payload};
  function fail(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error", message: message || "Unable to blur photo." }));
  }
  try {
    var img = new Image();
    img.onload = function () {
      var W = img.naturalWidth || img.width;
      var H = img.naturalHeight || img.height;
      var canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      var source = document.createElement("canvas");
      source.width = W;
      source.height = H;
      source.getContext("2d").drawImage(img, 0, 0, W, H);
      var regions = payload.regions || [];
      for (var i = 0; i < regions.length; i += 1) {
        var region = regions[i];
        var left = Math.max(0, Math.floor(region.x * W));
        var top = Math.max(0, Math.floor(region.y * H));
        var width = Math.min(W - left, Math.ceil(region.w * W));
        var height = Math.min(H - top, Math.ceil(region.h * H));
        if (width < 4 || height < 4) continue;

        // 1) Heavy gaussian blur, sampled from the untouched original.
        var patch = document.createElement("canvas");
        patch.width = width;
        patch.height = height;
        var pctx = patch.getContext("2d");
        var radius = Math.max(6, Math.round(Math.min(width, height) / 5));
        pctx.filter = "blur(" + radius + "px)";
        pctx.drawImage(source, left - radius, top - radius, width + radius * 2, height + radius * 2,
          -radius, -radius, width + radius * 2, height + radius * 2);

        // 2) Coarse pixelation (about 4 blocks across the short side).
        var block = Math.max(6, Math.round(Math.min(width, height) / 4));
        var sw = Math.max(1, Math.round(width / block));
        var sh = Math.max(1, Math.round(height / block));
        var sample = document.createElement("canvas");
        sample.width = sw;
        sample.height = sh;
        sample.getContext("2d").drawImage(patch, 0, 0, width, height, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sample, 0, 0, sw, sh, left, top, width, height);
      }
      var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "done", data: dataUrl }));
    };
    img.onerror = function () { fail("The photo could not be loaded for blurring."); };
    img.src = "data:image/jpeg;base64," + payload.base64;
  } catch (error) {
    fail(error && error.message);
  }
})();
</script>
</body>
</html>`;
}

// ===== [PRIVACY BLUR] Exported privacy editor modal =====
export default function EvidencePrivacyEditor({
  visible,
  uri,
  onCancel,
  onKeepOriginal,
  onSaved,
}) {
  // --- [PRIVACY BLUR] Refs, callbacks & bottom nav hiding ---
  const insets = useSafeAreaInsets();
  useHideBottomNav(visible);
  const runIdRef = useRef(0);
  const onKeepOriginalRef = useRef(onKeepOriginal);
  const onSavedRef = useRef(onSaved);
  onKeepOriginalRef.current = onKeepOriginal;
  onSavedRef.current = onSaved;

  useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [PRIVACY BLUR] State: status, error, blur HTML, busy ---
  const [statusText, setStatusText] = useState(
    "Scanning photo for confidential details..."
  );
  const [errorText, setErrorText] = useState("");
  const [applyHtml, setApplyHtml] = useState(null);
  const [busy, setBusy] = useState(false);

  // --- [PRIVACY BLUR] Detect with Roboflow (faces, plates, EasyOCR text) and build blur job ---
  const protectPhoto = useCallback(async (targetUri) => {
    const runId = ++runIdRef.current;
    const isStale = () => runId !== runIdRef.current;

    try {
      setBusy(true);
      setErrorText("");
      setApplyHtml(null);
      setStatusText("CitiSense is detecting faces, plates, IDs, and other private details...");

      const { regions, photo } = await detectConfidentialRegions(targetUri);
      if (isStale()) return;

      if (!regions.length) {
        setBusy(false);
        onKeepOriginalRef.current?.();
        return;
      }

      setStatusText(
        `Blurring ${regions.length} confidential area${regions.length === 1 ? "" : "s"}...`
      );
      setApplyHtml(redactHtml(photo.base64, regions));
    } catch (error) {
      if (isStale()) return;
      setBusy(false);
      setErrorText(
        error?.message ||
          "The app could not scan this photo for confidential details."
      );
    }
  }, []);

  useEffect(() => {
    if (!visible || !uri) {
      runIdRef.current += 1;
      setStatusText("Scanning photo for confidential details...");
      setErrorText("");
      setApplyHtml(null);
      setBusy(false);
      return undefined;
    }

    protectPhoto(uri);

    return () => {
      runIdRef.current += 1;
    };
  }, [visible, uri, protectPhoto]);

  // --- [PRIVACY BLUR] WebView result: save blurred JPEG to cache ---
  const handleWebViewMessage = async (event) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data || "{}");
      if (payload.type === "error") {
        setBusy(false);
        setApplyHtml(null);
        setErrorText(payload.message || "Unable to blur this photo.");
        return;
      }

      const dataUrl = String(payload.data || "");
      const comma = dataUrl.indexOf(",");
      const raw = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
      if (!raw) throw new Error("Empty photo");

      const path = `${FileSystem.cacheDirectory}citisense-private-${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(path, raw, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setBusy(false);
      setApplyHtml(null);
      onSavedRef.current?.(path);
    } catch (error) {
      setBusy(false);
      setApplyHtml(null);
      setErrorText(error?.message || "Unable to save the protected photo.");
    }
  };

  // --- [PRIVACY BLUR] Retry scan after an error ---
  const retryScan = () => {
    if (uri) protectPhoto(uri);
  };

  // --- [PRIVACY BLUR] Render ---
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: Math.max(insets.top, 16) }]}>
        {/* [PRIVACY BLUR UI] Header with close button */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel} activeOpacity={0.8}>
            <Ionicons name="close" size={22} color="rgba(255, 255, 255, 1)" />
          </TouchableOpacity>
          <Text style={styles.title}>Privacy protection</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* [PRIVACY BLUR UI] Photo preview */}
        <View style={styles.body}>
          {uri ? (
            <Image source={{ uri }} style={styles.photo} contentFit="contain" />
          ) : null}

          {/* [PRIVACY BLUR UI] Status overlay: spinner, message, error + retry */}
          <View style={styles.overlay}>
            {busy ? <ActivityIndicator color="rgba(255, 255, 255, 1)" size="large" /> : null}
            <Ionicons name="shield-checkmark" size={28} color="rgba(8, 122, 13, 1)" />
            <Text style={styles.status}>{statusText}</Text>
            <Text style={styles.hint}>
              The system blurs faces, IDs, plate numbers, and other personal
              details before this evidence is uploaded.
            </Text>
            {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
            {errorText ? (
              <TouchableOpacity style={styles.retryBtn} onPress={retryScan} activeOpacity={0.85}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>

      {/* [PRIVACY BLUR UI] Hidden WebView that performs the blur */}
      {applyHtml ? (
        <WebView
          source={{ html: applyHtml }}
          onMessage={handleWebViewMessage}
          originWhitelist={["*"]}
          javaScriptEnabled
          style={styles.hiddenWebView}
        />
      ) : null}
    </Modal>
  );
}

// ===== [PRIVACY BLUR] Styles =====
const styles = StyleSheet.create({
  // --- Screen & header ---
  screen: {
    flex: 1,
    backgroundColor: "rgba(16, 20, 17, 1)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "rgba(255, 255, 255, 1)",
  },
  // --- Photo body & status overlay ---
  body: {
    flex: 1,
    marginHorizontal: 12,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 1)",
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 12, 8, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  status: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: "rgba(255, 255, 255, 1)",
    textAlign: "center",
  },
  hint: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(199, 207, 196, 1)",
    lineHeight: 18,
    textAlign: "center",
  },
  error: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(255, 180, 180, 1)",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 6,
    backgroundColor: "rgba(8, 122, 13, 1)",
    borderRadius: 12,
    paddingHorizontal: 18,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontFamily: "Poppins_700Bold",
    color: "rgba(255, 255, 255, 1)",
    fontSize: 13,
  },
  hiddenWebView: {
    width: 1,
    height: 1,
    opacity: 0,
    position: "absolute",
  },
});

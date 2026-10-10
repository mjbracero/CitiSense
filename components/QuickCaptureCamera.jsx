import { Ionicons } from "@expo/vector-icons";
import {
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ===== [CAMERA] Exported quick-capture camera modal =====
/**
 * In-app camera: tap shutter → preview → X to retake or check to keep.
 */
export default function QuickCaptureCamera({
  visible,
  onClose,
  onCaptured,
}) {
  // --- [CAMERA] State, refs & permissions ---
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const capturingRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [statusText, setStatusText] = useState("Starting camera...");

  useFonts({
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [CAMERA] Reset on close / request permission on open ---
  useEffect(() => {
    if (!visible) {
      capturingRef.current = false;
      setCameraReady(false);
      setCapturing(false);
      setPreviewPhoto(null);
      setStatusText("Starting camera...");
      return;
    }

    let cancelled = false;

    const ensurePermission = async () => {
      if (permission?.granted) return true;
      const result = await requestPermission();
      return Boolean(result?.granted);
    };

    ensurePermission().then((granted) => {
      if (cancelled) return;
      if (!granted) {
        setStatusText("Camera permission is required");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [visible, permission?.granted, requestPermission]);

  // --- [CAMERA] Capture photo -> preview ---
  const capturePhoto = async () => {
    if (
      !visible ||
      !cameraReady ||
      capturingRef.current ||
      !cameraRef.current ||
      previewPhoto
    ) {
      return;
    }

    capturingRef.current = true;
    setCapturing(true);
    setStatusText("Capturing...");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
        shutterSound: true,
        exif: false,
      });

      if (!photo?.uri) {
        throw new Error("No photo returned");
      }

      setPreviewPhoto({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
        mimeType: "image/jpeg",
      });
      setStatusText("Review photo");
    } catch (error) {
      console.log("Quick capture error:", error);
      setStatusText("Tap to capture");
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  };

  // --- [CAMERA] Review handlers: retake, confirm, close ---
  const retakePhoto = () => {
    setPreviewPhoto(null);
    setStatusText(cameraReady ? "Tap to capture" : "Starting camera...");
  };

  const confirmPhoto = () => {
    if (!previewPhoto?.uri) return;
    onCaptured?.(previewPhoto);
    setPreviewPhoto(null);
  };

  const handleClose = () => {
    if (capturingRef.current) return;
    setPreviewPhoto(null);
    onClose?.();
  };

  // --- [CAMERA] Render ---
  if (!visible) {
    return null;
  }

  const topPad = Math.max(insets.top, Platform.OS === "android" ? 12 : 8);
  const bottomPad = Math.max(insets.bottom, 18);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {/* [CAMERA UI] Photo preview, live camera, or permission prompt */}
        {previewPhoto?.uri ? (
          <Image
            source={{ uri: previewPhoto.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
        ) : permission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
            animateShutter
            onCameraReady={() => {
              setCameraReady(true);
              setStatusText("Tap to capture");
            }}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionText}>
              Allow camera access to take complaint evidence photos.
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.permissionButton}
              onPress={requestPermission}
            >
              <Text style={styles.permissionButtonText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* [CAMERA UI] Top bar: close button & status text */}
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.closeButton}
            onPress={handleClose}
            disabled={capturing}
          >
            <Ionicons name="close" size={22} color="rgba(255, 255, 255, 1)" />
          </TouchableOpacity>
          <Text style={styles.statusText}>{statusText}</Text>
          <View style={styles.closeButtonSpacer} />
        </View>

        {/* [CAMERA UI] Bottom bar: review actions, spinner, or shutter */}
        <View style={[styles.bottomBar, { paddingBottom: bottomPad }]}>
          {previewPhoto ? (
            <>
              {/* [CAMERA UI] Review: retake (X) / use photo (check) */}
              <View style={styles.reviewActions}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.reviewButton, styles.retakeButton]}
                  onPress={retakePhoto}
                >
                  <Ionicons name="close" size={28} color="rgba(255, 255, 255, 1)" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.reviewButton, styles.confirmButton]}
                  onPress={confirmPhoto}
                >
                  <Ionicons name="checkmark" size={28} color="rgba(255, 255, 255, 1)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.hintText}>
                Tap X to retake, or check to use this photo
              </Text>
            </>
          ) : capturing ? (
            <ActivityIndicator size="large" color="rgba(255, 255, 255, 1)" />
          ) : (
            <>
              {/* [CAMERA UI] Shutter button */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.shutterOuter,
                  !cameraReady && styles.shutterOuterDisabled,
                ]}
                onPress={capturePhoto}
                disabled={!cameraReady}
              >
                <View style={styles.shutterInner} />
              </TouchableOpacity>
              <Text style={styles.hintText}>
                {cameraReady
                  ? "Aim at the issue, then tap the button to capture"
                  : "Getting camera ready..."}
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ===== [CAMERA] Styles =====
const styles = StyleSheet.create({
  // --- Root & top bar ---
  root: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 1)",
  },

  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  closeButtonSpacer: {
    width: 40,
    height: 40,
  },

  statusText: {
    flex: 1,
    textAlign: "center",
    color: "rgba(255, 255, 255, 1)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
  },

  // --- Bottom bar: shutter & review buttons ---
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  shutterOuter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  shutterOuterDisabled: {
    opacity: 0.45,
  },

  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255, 255, 255, 1)",
  },

  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 48,
  },

  reviewButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  retakeButton: {
    backgroundColor: "rgba(215, 25, 32, 1)",
  },

  confirmButton: {
    backgroundColor: "rgba(8, 122, 13, 1)",
  },

  hintText: {
    marginTop: 12,
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // --- Permission prompt ---
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    backgroundColor: "rgba(17, 17, 17, 1)",
  },

  permissionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "rgba(255, 255, 255, 1)",
    textAlign: "center",
  },

  permissionText: {
    marginTop: 8,
    fontFamily: "Poppins_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 20,
  },

  permissionButton: {
    marginTop: 18,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 20,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  permissionButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(255, 255, 255, 1)",
  },
});

import { Feather } from "@expo/vector-icons";
import {
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

function PhotoViewerContent({ uri, onClose }) {
  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" />

      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.closeButton}
        onPress={onClose}
      >
        <Feather name="x" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={1}
        style={styles.photoWrap}
        onPress={onClose}
      >
        <Image
          pointerEvents="none"
          source={{ uri }}
          style={styles.photo}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  );
}

/**
 * @param {"modal" | "overlay"} variant
 * Use "overlay" inside an already-open Modal (nested Modals often fail).
 * Use "modal" when no parent Modal is covering the screen.
 */
export default function FullscreenPhotoViewer({
  visible,
  uri,
  onClose,
  variant = "modal",
}) {
  if (!visible || !uri) return null;

  if (variant === "overlay") {
    return (
      <View style={styles.overlayHost} pointerEvents="box-none">
        <PhotoViewerContent uri={uri} onClose={onClose} />
      </View>
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle={Platform.OS === "ios" ? "overFullScreen" : "fullScreen"}
      onRequestClose={onClose}
    >
      <PhotoViewerContent uri={uri} onClose={onClose} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    elevation: 1000,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },

  closeButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 22,
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  photoWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  photo: {
    width: "100%",
    height: "100%",
  },
});

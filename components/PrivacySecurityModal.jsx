import { Feather } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHideBottomNav } from "./PersistentBottomNav";

// ===== [PRIVACY MODAL] Content per role (intro + sections) =====
const CONTENT_BY_ROLE = {
  admin: {
    intro:
      "How CitiSense protects admin accounts, complaint records, and LGU system access.",
    sections: [
      {
        icon: "shield",
        title: "Access control",
        body: "Only authorized admin users can access complaint records, analytics, notifications, and system management tools.",
      },
      {
        icon: "user",
        title: "Account information",
        body: "Your admin account details are used for identification, access control, and LGU system activity tracking.",
      },
      {
        icon: "lock",
        title: "Password security",
        body: "Keep your password private, use a strong password, and always log out when using a shared device.",
      },
    ],
  },
  citizen: {
    intro:
      "How CitiSense protects your account, complaint evidence, and personal details.",
    sections: [
      {
        icon: "shield",
        title: "Account protection",
        body: "Only authorized users can access submitted complaint reports and related updates.",
      },
      {
        icon: "user",
        title: "Personal information",
        body: "Your name, email, contact number, barangay, and profile photo are used only for identification, complaint updates, and LGU communication.",
      },
      {
        icon: "camera",
        title: "Photos and evidence",
        body: "Uploaded complaint photos and location details are used as evidence so the LGU can verify, classify, and process your complaint. Before a photo is stored, CitiSense automatically scans it and blurs faces, IDs, plate numbers, and other confidential details.",
      },
      {
        icon: "map-pin",
        title: "Location services",
        body: "Location services help attach accurate complaint location details when submitting reports.",
      },
      {
        icon: "lock",
        title: "Password security",
        body: "Keep your password private, use a strong password, and always log out when using a shared device.",
      },
    ],
  },
  departmentHead: {
    intro:
      "How CitiSense protects department head accounts and assigned complaint handling.",
    sections: [
      {
        icon: "shield",
        title: "Assigned access",
        body: "Only authorized department heads can access complaint records assigned to their office.",
      },
      {
        icon: "user",
        title: "Profile information",
        body: "Your name, email, contact number, department, and profile photo are used for account identification and LGU complaint coordination.",
      },
      {
        icon: "map-pin",
        title: "Location permission",
        body: "Location may be used for map routing, pinned complaint navigation, and viewing your current position while handling assigned complaints.",
      },
      {
        icon: "lock",
        title: "Password security",
        body: "Keep your password private, use a strong password, and always log out when using a shared device.",
      },
    ],
  },
};

// ===== [PRIVACY MODAL] Helper: normalize role key =====
function resolveRoleKey(role) {
  const clean = String(role || "").toLowerCase();
  if (clean === "admin") return "admin";
  if (clean === "moderator" || clean === "departmenthead") {
    return "departmentHead";
  }
  return "citizen";
}

// ===== [PRIVACY MODAL] Exported bottom sheet modal =====
/**
 * Full Privacy & Security sheet (not a short toast/popup).
 */
export default function PrivacySecurityModal({
  visible,
  onClose,
  role = "citizen",
}) {
  // --- [PRIVACY MODAL] Insets, bottom nav hiding, fonts, content ---
  const insets = useSafeAreaInsets();
  useHideBottomNav(visible);

  useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const content =
    CONTENT_BY_ROLE[resolveRoleKey(role)] || CONTENT_BY_ROLE.citizen;

  // --- [PRIVACY MODAL] Render ---
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          {/* [PRIVACY MODAL UI] Drag handle */}
          <View style={styles.handle} />

          {/* [PRIVACY MODAL UI] Header: title & close button */}
          <View style={styles.headerRow}>
            <Text style={styles.title}>Privacy & Security</Text>
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.closeButton}
              onPress={onClose}
            >
              <Feather name="x" size={20} color="rgba(23, 23, 23, 1)" />
            </TouchableOpacity>
          </View>

          {/* [PRIVACY MODAL UI] Scrollable intro + section cards */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <Text style={styles.intro}>{content.intro}</Text>

            {content.sections.map((section) => (
              <View key={section.title} style={styles.card}>
                <View style={styles.cardIcon}>
                  <Feather name={section.icon} size={16} color="rgba(8, 122, 13, 1)" />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{section.title}</Text>
                  <Text style={styles.cardBody}>{section.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ===== [PRIVACY MODAL] Styles =====
const styles = StyleSheet.create({
  // --- Sheet & header ---
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  sheet: {
    maxHeight: "88%",
    backgroundColor: "rgba(247, 250, 246, 1)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(213, 218, 211, 1)",
    marginBottom: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "rgba(23, 23, 23, 1)",
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
  },

  // --- Content & cards ---
  content: {
    paddingBottom: 18,
  },

  intro: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12.5,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 19,
    marginBottom: 14,
  },

  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },

  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(234, 246, 228, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  cardText: {
    flex: 1,
  },

  cardTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 4,
  },

  cardBody: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(111, 119, 111, 1)",
    lineHeight: 18,
  },
});

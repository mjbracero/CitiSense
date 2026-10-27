import {
  Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import { decode } from "base64-arraybuffer";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import KeyboardAwareScrollView from "../../components/KeyboardAwareScrollView";
import AuditLogsModal from "../../components/AuditLogsModal";
import PrivacySecurityModal from "../../components/PrivacySecurityModal";
import SystemBackupModal, { BACKUP_API_CONFIGURED } from "../../components/SystemBackupModal";
import SystemLogAnalysisModal from "../../components/SystemLogAnalysisModal";
import { PageSkeleton } from "../../components/skeletons";
import { writeAuditLog } from "../../lib/auditLogService";
import { clearPageCache, getPageCache, setPageCache, shouldShowPageLoader } from "../../lib/pageDataCache";
import { setProfileAvatarUrl } from "../../lib/profileAvatarStore";
import { syncOwnProfileRow } from "../../lib/syncOwnProfile";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import {
  loadPushEnabled,
  registerDevicePushToken,
  removePushTokensForUser,
  updatePushEnabled,
} from "../../lib/pushNotifications";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

// ===== [ADMIN PROFILE] Constants: colors, layout, avatar bucket, cache key =====

const H_PADDING = 20;
const PROFILE_SHEET_MAX_HEIGHT = Math.round(Dimensions.get("screen").height * 0.9);
const AVATAR_BUCKET = "avatars";
const ADMIN_PROFILE_CACHE_KEY = "admin.profile";

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

// ===== [ADMIN PROFILE] Default profile & module-level profile cache =====
const DEFAULT_ADMIN_PROFILE = {
  fullName: "City Administrator",
  role: "Admin",
  email: "admin@citisense.gov.ph",
  contact: "0912 345 6789",
  office: "City Administrator Office",
  location: "Bogo City Hall, Bogo City, Cebu",
  avatarUrl: null,
  rawAvatarValue: null,
};

let cachedAdminProfile = DEFAULT_ADMIN_PROFILE;

// ===== [ADMIN PROFILE] Legacy bottom tabs config =====
const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/admin/dashboard",
    activePath: "adminDashboard",
    flex: 0.82,
  },
  {
    label: "Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/admin/complaints",
    activePath: "adminComplaints",
    flex: 1.1,
  },
  {
    label: "Analytics",
    activeIcon: "analytics",
    inactiveIcon: "analytics-outline",
    route: "/admin/analytics",
    activePath: "adminAnalytics",
    flex: 1,
  },
  {
    label: "Notifications",
    activeIcon: "notifications",
    inactiveIcon: "notifications-outline",
    route: "/admin/notification",
    activePath: "adminNotification",
    flex: 1.15,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/admin/profile",
    activePath: "adminProfile",
    flex: 0.82,
  },
];

// ===== [ADMIN PROFILE] Helpers: text cleanup, image extension =====
function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getImageExtension(asset) {
  const fileName = asset?.fileName?.toLowerCase() || "";
  const uri = asset?.uri?.toLowerCase() || "";
  const mimeType = asset?.mimeType?.toLowerCase() || "";

  if (
    mimeType.includes("png") ||
    fileName.endsWith(".png") ||
    uri.endsWith(".png")
  ) {
    return "png";
  }

  if (fileName.endsWith("jpg") || uri.endsWith(".jpg")) {
    return "jpg";
  }

  return "jpeg";
}

// ===== [ADMIN PROFILE] Avatar storage: resolve path & signed/public URL =====
function extractAvatarPath(value) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const signMarker = `/storage/v1/object/sign/${AVATAR_BUCKET}/`;

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  if (!/^https?:\/\//i.test(text)) {
    return text.replace(/^avatars\//, "").replace(/^\/+/, "");
  }

  return null;
}

async function createReadableAvatarUrl(value) {
  if (!value) return null;

  try {
    const path = extractAvatarPath(value);

    if (path) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrl(path, 60 * 60);

      if (!signedError && signedData?.signedUrl) {
        return signedData.signedUrl;
      }

      const { data: publicData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(path);

      if (publicData?.publicUrl) {
        return publicData.publicUrl;
      }
    }

    if (/^https?:\/\//i.test(String(value))) {
      return String(value);
    }
  } catch (error) {
    console.log("Resolve admin avatar error:", error);
  }

  return null;
}

// ===== [ADMIN PROFILE] Screen component =====
export default function AdminProfile() {
  // --- [ADMIN PROFILE] State, modal visibility & drafts ---
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 8);
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  const cachedPage = getPageCache(ADMIN_PROFILE_CACHE_KEY);
  const [user, setUser] = useState(cachedPage?.user ?? null);
  const [profileInfo, setProfileInfo] = useState(
    cachedPage?.profileInfo ?? cachedAdminProfile
  );
  const [loadingUser, setLoadingUser] = useState(!cachedPage);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [auditLogsVisible, setAuditLogsVisible] = useState(false);
  const [systemLogAnalysisVisible, setSystemLogAnalysisVisible] =
    useState(false);
  const [systemBackupVisible, setSystemBackupVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  useHideBottomNav(
    editModalVisible ||
      passwordModalVisible ||
      systemLogAnalysisVisible ||
      systemBackupVisible ||
      privacyVisible
  );

  const [fullNameDraft, setFullNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [officeDraft, setOfficeDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pushEnabled, setPushEnabled] = useState(
    cachedPage?.pushEnabled ?? true
  );

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  // --- [ADMIN PROFILE] Derived display values ---
  const displayName = profileInfo.fullName;
  const displayEmail = profileInfo.email;
  const displayRole = "Admin";
  const displayContact = profileInfo.contact;
  const displayOffice = profileInfo.office;
  const displayLocation = profileInfo.location;
  const avatarUrl = profileInfo.avatarUrl;

  // --- [ADMIN PROFILE] Load profile (auth user + profiles row + push pref) ---
  const loadUser = useCallback(async () => {
    try {
      if (shouldShowPageLoader(ADMIN_PROFILE_CACHE_KEY)) {
        setLoadingUser(true);
      }

      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error || !currentUser) {
        if (shouldShowPageLoader(ADMIN_PROFILE_CACHE_KEY)) {
          setUser(null);
        }
        return;
      }

      const metadata = currentUser.user_metadata || {};

      let profileRow = null;

      try {
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, email, role, full_name, contact_number, department, avatar_url"
          )
          .eq("id", currentUser.id)
          .maybeSingle();

        if (!profileError && data) {
          profileRow = data;
        }
      } catch (profileLoadError) {
        console.log("Admin profile row load skipped:", profileLoadError);
      }

      const rawAvatarValue =
        profileRow?.avatar_url || metadata.avatar_url || cachedAdminProfile.rawAvatarValue;

      const readableAvatarUrl = await createReadableAvatarUrl(rawAvatarValue);

      const nextProfileInfo = {
        fullName:
          profileRow?.full_name ||
          metadata.full_name ||
          metadata.name ||
          metadata.username ||
          currentUser.email?.split("@")[0] ||
          DEFAULT_ADMIN_PROFILE.fullName,
        role: "Admin",
        email: profileRow?.email || currentUser.email || DEFAULT_ADMIN_PROFILE.email,
        contact:
          profileRow?.contact_number ||
          metadata.contact_number ||
          metadata.contact ||
          DEFAULT_ADMIN_PROFILE.contact,
        office:
          profileRow?.department ||
          metadata.office ||
          metadata.department ||
          DEFAULT_ADMIN_PROFILE.office,
        location:
          metadata.location || DEFAULT_ADMIN_PROFILE.location,
        avatarUrl: readableAvatarUrl,
        rawAvatarValue: rawAvatarValue || null,
      };

      if (
        currentUser.id &&
        !normalizeSpace(profileRow?.department) &&
        nextProfileInfo.office
      ) {
        supabase
          .from("profiles")
          .update({ department: nextProfileInfo.office })
          .eq("id", currentUser.id)
          .then(({ error: officeError }) => {
            if (officeError) {
              console.log("Auto-set admin office error:", officeError);
            }
          });
      }

      cachedAdminProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(currentUser);
      if (readableAvatarUrl) {
        setProfileAvatarUrl(readableAvatarUrl);
      }

      let enabled = getPageCache(ADMIN_PROFILE_CACHE_KEY)?.pushEnabled ?? true;
      if (currentUser?.id) {
        enabled = await loadPushEnabled(currentUser.id);
        setPushEnabled(enabled);
      }

      setPageCache(ADMIN_PROFILE_CACHE_KEY, {
        user: currentUser,
        profileInfo: nextProfileInfo,
        pushEnabled: enabled,
      });
    } catch (error) {
      console.log("Load admin profile error:", error);
      if (shouldShowPageLoader(ADMIN_PROFILE_CACHE_KEY)) {
        setUser(null);
      }
    } finally {
      setLoadingUser(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUser();
    }, [loadUser])
  );

  const metadata = user?.user_metadata || {};

  // --- [ADMIN PROFILE] Open/close edit & password modals ---
  const openEditProfile = () => {
    setFullNameDraft(displayName === DEFAULT_ADMIN_PROFILE.fullName ? "" : displayName);
    setEmailDraft(displayEmail === DEFAULT_ADMIN_PROFILE.email ? "" : displayEmail);
    setContactDraft(displayContact === DEFAULT_ADMIN_PROFILE.contact ? "" : displayContact);
    setOfficeDraft(displayOffice || DEFAULT_ADMIN_PROFILE.office);
    setLocationDraft(displayLocation || DEFAULT_ADMIN_PROFILE.location);
    setEditModalVisible(true);
  };

  const closeEditProfile = () => {
    Keyboard.dismiss();
    setEditModalVisible(false);
  };

  const closePasswordModal = () => {
    Keyboard.dismiss();
    setPasswordModalVisible(false);
    setNewPassword("");
    setConfirmPassword("");
  };

  // --- [ADMIN PROFILE] Sync profiles table row ---
  const syncProfileRow = async ({
    fullName,
    email,
    contact,
    office,
    location,
    avatarValue,
  }) => {
    if (!user?.id) return;

    await syncOwnProfileRow({
      userId: user.id,
      fullName: fullName || displayName,
      email: email || displayEmail,
      contactNumber: contact || null,
      department: office || null,
      avatarUrl: avatarValue || null,
    });
  };

  // --- [ADMIN PROFILE] Pick & upload profile photo ---
  const pickProfilePhoto = async () => {
    try {
      if (!user?.id) {
        notify("Account Required", "Please sign in again.");
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        notify(
          "Permission Needed",
          "Please allow photo access so you can change your profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        notify(
          "Upload Failed",
          "The selected image could not be prepared for upload. Please choose another photo."
        );
        return;
      }

      setUploadingAvatar(true);

      const extension = getImageExtension(asset);
      const contentType =
        asset.mimeType || `image/${extension === "jpg" ? "jpeg" : extension}`;
      const filePath = `${user.id}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(filePath, decode(asset.base64), {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        notify(
          "Upload Failed",
          "Please make sure the Supabase Storage bucket named avatars exists and has the correct upload policies."
        );
        return;
      }

      const readableAvatarUrl = await createReadableAvatarUrl(filePath);

      const nextMetadata = {
        ...metadata,
        full_name: displayName,
        contact_number: displayContact,
        office: displayOffice,
        location: displayLocation,
        role: "admin",
        avatar_url: filePath,
      };

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        notify("Update Failed", error.message);
        return;
      }

      await syncProfileRow({
        fullName: displayName,
        email: displayEmail,
        contact: displayContact,
        office: displayOffice,
        location: displayLocation,
        avatarValue: filePath,
      });

      const nextProfileInfo = {
        ...profileInfo,
        role: "Admin",
        avatarUrl: readableAvatarUrl,
        rawAvatarValue: filePath,
      };

      cachedAdminProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(data?.user || user);
      setProfileAvatarUrl(readableAvatarUrl);

      notify("Profile Picture Updated", "Your admin picture has been changed.");
      await writeAuditLog({
        action: "avatar_update",
        title: "Profile Picture Updated",
        description: "Admin profile picture was changed.",
        actorRole: "admin",
      });
    } catch (error) {
      console.log("Admin avatar upload error:", error);
      notify("Upload Failed", "Unable to update your profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // --- [ADMIN PROFILE] Save edited profile (incl. email change) ---
  const saveProfileChanges = async () => {
    const cleanName = normalizeSpace(fullNameDraft);
    const cleanEmail = normalizeSpace(emailDraft);
    const cleanContact = normalizeSpace(contactDraft);
    const cleanOffice =
      normalizeSpace(officeDraft) ||
      displayOffice ||
      DEFAULT_ADMIN_PROFILE.office;
    const cleanLocation =
      normalizeSpace(locationDraft) ||
      displayLocation ||
      DEFAULT_ADMIN_PROFILE.location;

    if (!cleanName) {
      notify("Name Required", "Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      notify("Email Required", "Please enter your email address.");
      return;
    }

    try {
      setSavingProfile(true);

      const nextMetadata = {
        ...metadata,
        full_name: cleanName,
        contact_number: cleanContact,
        office: cleanOffice,
        location: cleanLocation,
        role: "admin",
        avatar_url: profileInfo.rawAvatarValue || metadata.avatar_url || null,
      };

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        notify("Update Failed", error.message);
        return;
      }

      await syncProfileRow({
        fullName: cleanName,
        email: displayEmail,
        contact: cleanContact,
        office: cleanOffice,
        location: cleanLocation,
        avatarValue: profileInfo.rawAvatarValue || metadata.avatar_url || null,
      });

      const emailChanged = cleanEmail.toLowerCase() !== displayEmail.toLowerCase();

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: cleanEmail,
        });

        if (emailError) {
          notify("Email Update Failed", emailError.message);
          return;
        }

        notify(
          "Confirm New Email",
          "We sent a confirmation link to your new email address. Please confirm it before the email change becomes complete."
        );
      } else {
        notify("Profile Updated", "Your admin information was saved.");
      }

      await writeAuditLog({
        action: "profile_update",
        title: "Profile Updated",
        description: "Admin account information was updated.",
        actorRole: "admin",
        actorName: cleanName,
      });

      const nextProfileInfo = {
        fullName: cleanName,
        role: "Admin",
        email: emailChanged ? displayEmail : cleanEmail,
        contact: cleanContact || DEFAULT_ADMIN_PROFILE.contact,
        office: cleanOffice || DEFAULT_ADMIN_PROFILE.office,
        location: cleanLocation || DEFAULT_ADMIN_PROFILE.location,
        avatarUrl: profileInfo.avatarUrl,
        rawAvatarValue: profileInfo.rawAvatarValue,
      };

      cachedAdminProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(data?.user || user);
      setEditModalVisible(false);
      loadUser();
    } catch (error) {
      console.log("Save admin profile error:", error);
      notify("Update Failed", "Unable to save your profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  // --- [ADMIN PROFILE] Change password ---
  const handleChangePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      notify("Password Required", "Please enter and confirm your password.");
      return;
    }

    if (newPassword.length < 6) {
      notify(
        "Weak Password",
        "Your new password must be at least 6 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      notify("Password Mismatch", "Your passwords do not match.");
      return;
    }

    try {
      setChangingPassword(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        notify("Password Update Failed", error.message);
        return;
      }

      notify(
        "Password Changed",
        "Your password has been updated successfully."
      );

      await writeAuditLog({
        action: "password_change",
        title: "Password Changed",
        description: "Admin account password was updated.",
        actorRole: "admin",
      });

      closePasswordModal();
    } catch {
      notify("Password Update Failed", "Unable to change your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  // --- [ADMIN PROFILE] Settings: push toggle, privacy, logout ---
  const handlePushToggle = async (value) => {
    if (!user?.id) {
      setPushEnabled(value);
      return;
    }

    const { error } = await updatePushEnabled(user.id, value);

    if (error) {
      notify(
        "Push Notifications",
        "Unable to update push notification preference."
      );
      return;
    }

    setPushEnabled(value);

    writeAuditLog({
      action: "push_preference",
      title: value ? "Push Notifications Enabled" : "Push Notifications Disabled",
      description: value
        ? "Push notifications were turned on."
        : "Push notifications were turned off.",
      actorRole: "admin",
    });

    if (value) {
      await registerDevicePushToken(user.id);
    }
  };

  const handlePrivacy = () => {
    setPrivacyVisible(true);
  };

  const handleLogout = () => {
    notify("Log Out", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await writeAuditLog({
            action: "logout",
            title: "Signed Out",
            description: "Admin signed out of CitiSense.",
            actorRole: "admin",
          });
          await removePushTokensForUser(user?.id);
          const { error } = await supabase.auth.signOut();

          if (error) {
            notify("Logout Failed", error.message);
            return;
          }

          void clearPageCache();

          setUser(null);
          router.replace("/auth/login");
        },
      },
    ]);
  };

  // --- [ADMIN PROFILE] Render ---
  if (!fontsLoaded || loadingUser) {
    return <PageSkeleton variant="profile" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [ADMIN PROFILE UI] Fixed header: CitiSense logo */}
        <View style={styles.fixedHeader}>
          <View style={styles.logoRow}>
            <Image source={MAIN_LOGO} style={styles.mainLogoImage} />

            <Text style={styles.logoText}>
              Citi<Text style={styles.logoTextLight}>Sense</Text>
            </Text>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* [ADMIN PROFILE UI] Profile card: avatar, camera button, name, Edit */}
          <View style={styles.profileHeroCard}>
            <View style={styles.avatarOuter}>
              <View style={styles.avatarCircle}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={42} color="rgba(8, 122, 13, 1)" />
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cameraButton}
                onPress={pickProfilePhoto}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="rgba(255, 255, 255, 1)" />
                ) : (
                  <Ionicons name="camera" size={15} color="rgba(255, 255, 255, 1)" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.profileMainInfo}>
              <Text style={styles.profileName} numberOfLines={2}>
                {displayName}
              </Text>
              <Text style={styles.profileRole}>{displayRole}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.editButton}
              onPress={openEditProfile}
            >
              <Feather name="edit-2" size={15} color="rgba(8, 122, 13, 1)" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>

          {/* [ADMIN PROFILE UI] Account Information section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Account Information</Text>

            <View style={styles.infoCard}>
              <InfoRow icon="mail" label="Email Address" value={displayEmail} />

              <InfoRow
                icon="phone"
                label="Contact Number"
                value={displayContact}
              />

              <InfoRow icon="briefcase" label="Role" value={displayRole} last />
            </View>
          </View>

          {/* [ADMIN PROFILE UI] Office Information section */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Office Information</Text>

            <View style={styles.infoCard}>
              <InfoRow icon="home" label="Office" value={displayOffice} />

              <InfoRow
                icon="map-pin"
                label="Location"
                value={displayLocation}
                last
              />
            </View>
          </View>

          {/* [ADMIN PROFILE UI] Notifications section: push toggle */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Notifications</Text>

            <View style={styles.settingsCard}>
              <SwitchRow
                icon="bell"
                label="Push Notifications"
                description="Receive complaint and system updates."
                value={pushEnabled}
                onValueChange={handlePushToggle}
                last
              />
            </View>
          </View>

          {/* [ADMIN PROFILE UI] Settings list: password, audit logs, log analysis, privacy */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Settings</Text>

            <View style={styles.settingsCard}>
              <ActionRow
                icon="lock"
                iconColor="rgba(49, 90, 154, 1)"
                title="Change Password"
                subtitle="Update your admin account password."
                onPress={() => setPasswordModalVisible(true)}
              />

              <ActionRow
                icon="activity"
                iconColor="rgba(49, 90, 154, 1)"
                title="Audit Logs"
                subtitle="Review account and system activity."
                onPress={() => setAuditLogsVisible(true)}
              />

              <ActionRow
                icon="bar-chart-2"
                iconColor="rgba(8, 122, 13, 1)"
                title="System Log Analysis"
                subtitle="AI accuracy, processing time, and resolution metrics."
                onPress={() => setSystemLogAnalysisVisible(true)}
              />

              {BACKUP_API_CONFIGURED ? (
                <ActionRow
                  icon="database"
                  iconColor="rgba(49, 90, 154, 1)"
                  title="System Backup"
                  subtitle="Nightly backups, recovery status, and downloads."
                  onPress={() => setSystemBackupVisible(true)}
                />
              ) : null}

              <ActionRow
                icon="shield"
                iconColor="rgba(8, 122, 13, 1)"
                title="Privacy & Security"
                subtitle="Manage your account protection."
                onPress={handlePrivacy}
                last
              />
            </View>
          </View>

          {/* [ADMIN PROFILE UI] Log Out button */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color="rgba(215, 25, 32, 1)" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* [ADMIN PROFILE UI] Edit Profile modal */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeEditProfile}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={Keyboard.dismiss}
            />
            <View
              style={[styles.editSheet, { paddingBottom: sheetBottomPad }]}
            >
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Edit Profile</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={closeEditProfile}
                >
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                modal
                bottomOffset={72}
                style={styles.editSheetScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === "ios" ? "interactive" : "on-drag"
                }
                contentContainerStyle={styles.modalScrollContent}
              >
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  value={fullNameDraft}
                  onChangeText={setFullNameDraft}
                  placeholder="Enter full name"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                />

                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.input}
                  value={emailDraft}
                  onChangeText={setEmailDraft}
                  placeholder="Enter email address"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.inputLabel}>Contact Number</Text>
                <TextInput
                  style={styles.input}
                  value={contactDraft}
                  onChangeText={setContactDraft}
                  placeholder="Enter contact number"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                  keyboardType="phone-pad"
                />

                <Text style={styles.inputLabel}>Office</Text>
                <TextInput
                  style={styles.input}
                  value={officeDraft}
                  onChangeText={setOfficeDraft}
                  placeholder="Enter office"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                />

                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  style={styles.input}
                  value={locationDraft}
                  onChangeText={setLocationDraft}
                  placeholder="Enter location"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                />

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.saveButton}
                  onPress={saveProfileChanges}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="rgba(255, 255, 255, 1)" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </KeyboardAwareScrollView>
            </View>
          </View>
        </Modal>

        {/* [ADMIN PROFILE UI] Change Password modal */}
        <Modal
          visible={passwordModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closePasswordModal}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={Keyboard.dismiss}
            />
            <View
              style={[styles.passwordSheet, { paddingBottom: sheetBottomPad }]}
            >
              <View style={styles.modalHandle} />

              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Change Password</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={closePasswordModal}
                >
                  <Feather name="x" size={21} color="rgba(23, 23, 23, 1)" />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                modal
                bottomOffset={24}
                style={styles.editSheetScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={
                  Platform.OS === "ios" ? "interactive" : "on-drag"
                }
                contentContainerStyle={styles.modalScrollContent}
              >
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />

                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor="rgba(154, 154, 154, 1)"
                  keyboardType="default"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.saveButton}
                  onPress={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? (
                    <ActivityIndicator size="small" color="rgba(255, 255, 255, 1)" />
                  ) : (
                    <Text style={styles.saveButtonText}>Update Password</Text>
                  )}
                </TouchableOpacity>
              </KeyboardAwareScrollView>
            </View>
          </View>
        </Modal>

        {/* [ADMIN PROFILE UI] Audit Logs modal */}
        <AuditLogsModal
          visible={auditLogsVisible}
          onClose={() => setAuditLogsVisible(false)}
        />

        {/* [ADMIN PROFILE UI] System Log Analysis modal */}
        <SystemLogAnalysisModal
          visible={systemLogAnalysisVisible}
          onClose={() => setSystemLogAnalysisVisible(false)}
        />

        {/* [ADMIN PROFILE UI] System Backup modal */}
        <SystemBackupModal
          visible={systemBackupVisible}
          onClose={() => setSystemBackupVisible(false)}
        />

        {/* [ADMIN PROFILE UI] Privacy & Security modal */}
        <PrivacySecurityModal
          visible={privacyVisible}
          onClose={() => setPrivacyVisible(false)}
          role="admin"
        />
      </View>
    </SafeAreaView>
  );
}

// ===== [ADMIN PROFILE] Subcomponents: InfoRow, SwitchRow, ActionRow =====
function InfoRow({ icon, label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.noBorder]}>
      <View style={styles.infoIconCircle}>
        <Feather name={icon} size={15} color="rgba(8, 122, 13, 1)" />
      </View>

      <View style={styles.infoTextBox}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function SwitchRow({ icon, label, description, value, onValueChange, last }) {
  return (
    <View style={[styles.settingRow, last && styles.noBorder]}>
      <View style={styles.settingIconCircle}>
        <Feather name={icon} size={15} color="rgba(8, 122, 13, 1)" />
      </View>

      <View style={styles.settingTextBox}>
        <Text style={styles.settingTitle}>{label}</Text>
        <Text style={styles.settingSubtitle}>{description}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "rgba(213, 218, 211, 1)", true: "rgba(191, 227, 181, 1)" }}
        thumbColor={value ? "rgba(8, 122, 13, 1)" : "rgba(244, 244, 244, 1)"}
        ios_backgroundColor="rgba(213, 218, 211, 1)"
      />
    </View>
  );
}

function ActionRow({ icon, iconColor, title, subtitle, onPress, last }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      style={[styles.settingRow, last && styles.noBorder]}
      onPress={onPress}
    >
      <View style={[styles.settingIconCircle, { backgroundColor: "rgba(247, 250, 246, 1)" }]}>
        <Feather name={icon} size={15} color={iconColor} />
      </View>

      <View style={styles.settingTextBox}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>

      <Feather name="chevron-right" size={20} color="rgba(111, 119, 111, 1)" />
    </TouchableOpacity>
  );
}

// ===== [ADMIN PROFILE] Styles =====
const styles = StyleSheet.create({
  // --- Layout & header ---
  safeArea: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(247, 250, 246, 1)",
  },

  fixedHeader: {
    height: 46,
    paddingHorizontal: H_PADDING,
    marginTop: 0,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: "transparent",
    zIndex: 20,
  },

  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  mainLogoImage: {
    width: 42,
    height: 42,
    resizeMode: "contain",
    marginRight: 6,
  },

  logoText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 25,
    color: "rgba(8, 122, 13, 1)",
    letterSpacing: 0.1,
  },

  logoTextLight: {
    color: "rgba(109, 187, 63, 1)",
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    paddingBottom: BOTTOM_NAV_CONTENT_INSET,
  },

  // --- Profile card ---
  profileHeroCard: {
    borderRadius: 20,
    backgroundColor: "rgba(8, 122, 13, 1)",
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    position: "relative",
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  avatarOuter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 13,
    position: "relative",
  },

  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  avatarImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },

  cameraButton: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "rgba(215, 25, 32, 1)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  profileMainInfo: {
    flex: 1,
    paddingRight: 70,
  },

  profileName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: "rgba(255, 255, 255, 1)",
    lineHeight: 22,
  },

  profileRole: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    marginTop: 1,
  },

  editButton: {
    position: "absolute",
    top: 12,
    right: 12,
    minWidth: 58,
    height: 31,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
    zIndex: 2,
  },

  editButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: "rgba(8, 122, 13, 1)",
    marginLeft: 4,
  },

  // --- Info & settings sections ---
  sectionBlock: {
    marginBottom: 15,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 9,
  },

  infoCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 13,
    paddingVertical: 3,
  },

  infoRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(237, 241, 235, 1)",
  },

  infoIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(234, 246, 228, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  infoTextBox: {
    flex: 1,
  },

  infoLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11.5,
    color: "rgba(8, 122, 13, 1)",
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 1,
  },

  settingsCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: 13,
    paddingVertical: 3,
  },

  settingRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(237, 241, 235, 1)",
  },

  settingIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(234, 246, 228, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  settingTextBox: {
    flex: 1,
    paddingRight: 8,
  },

  settingTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12.5,
    color: "rgba(23, 23, 23, 1)",
  },

  settingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.3,
    color: "rgba(111, 119, 111, 1)",
    marginTop: 1,
  },

  noBorder: {
    borderBottomWidth: 0,
  },

  // --- Log out button ---
  logoutButton: {
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(242, 196, 196, 1)",
    backgroundColor: "rgba(255, 244, 244, 1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  logoutText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: "rgba(215, 25, 32, 1)",
    marginLeft: 8,
  },

  // --- Legacy bottom nav ---
  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: "rgba(255, 255, 255, 1)",
    borderTopWidth: 1,
    borderTopColor: "rgba(226, 231, 224, 1)",
    shadowColor: "rgba(0, 0, 0, 1)",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 6,
    paddingBottom: Platform.OS === "ios" ? 38 : 32,
  },

  navItem: {
    height: 58,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },

  navIconWrap: {
    position: "relative",
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },

  notificationNavBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: "rgba(215, 25, 32, 1)",
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 1)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: "rgba(255, 255, 255, 1)",
    includeFontPadding: false,
    lineHeight: 11,
  },

  navLabel: {
    fontSize: 8.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },

  // --- Edit / password modals & form inputs ---
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  editSheet: {
    maxHeight: PROFILE_SHEET_MAX_HEIGHT,
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    overflow: "hidden",
  },

  passwordSheet: {
    maxHeight: PROFILE_SHEET_MAX_HEIGHT,
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 1)",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    overflow: "hidden",
  },

  editSheetScroll: {
    flexShrink: 1,
    minHeight: 0,
  },

  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "rgba(215, 215, 215, 1)",
    alignSelf: "center",
    marginBottom: 14,
  },

  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  modalTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: "rgba(8, 122, 13, 1)",
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(247, 250, 246, 1)",
    alignItems: "center",
    justifyContent: "center",
  },

  modalScrollContent: {
    paddingBottom: 0,
  },

  inputLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: "rgba(8, 122, 13, 1)",
    marginBottom: 7,
  },

  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226, 231, 224, 1)",
    backgroundColor: "rgba(247, 250, 246, 1)",
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: "rgba(23, 23, 23, 1)",
    marginBottom: 13,
  },

  saveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "rgba(8, 122, 13, 1)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  saveButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: "rgba(255, 255, 255, 1)",
  },
});

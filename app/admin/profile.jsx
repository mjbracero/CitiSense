import { Feather, Ionicons } from "@expo/vector-icons";
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
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import {
  loadPushEnabled,
  registerDevicePushToken,
  removePushTokensForUser,
  updatePushEnabled,
} from "../../lib/pushNotifications";
import useAdminUnreadNotifications from "../../hooks/useAdminUnreadNotifications";

const GREEN = "#087A0D";
const LIGHT_GREEN = "#EAF6E4";
const ACCENT_GREEN = "#6DBB3F";
const BG = "#F7FAF6";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";
const BORDER = "#E2E7E0";
const RED = "#D71920";
const BLUE = "#315A9A";

const H_PADDING = 20;
const AVATAR_BUCKET = "avatars";

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

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

export default function AdminProfile() {
  const router = useRouter();
  const pathname = usePathname();
  const { unreadNotificationCount } = useAdminUnreadNotifications();

  const [user, setUser] = useState(null);
  const [profileInfo, setProfileInfo] = useState(cachedAdminProfile);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);

  const [fullNameDraft, setFullNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [officeDraft, setOfficeDraft] = useState("");
  const [locationDraft, setLocationDraft] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const displayName = profileInfo.fullName;
  const displayEmail = profileInfo.email;
  const displayRole = "Admin";
  const displayContact = profileInfo.contact;
  const displayOffice = profileInfo.office;
  const displayLocation = profileInfo.location;
  const avatarUrl = profileInfo.avatarUrl;

  const loadUser = useCallback(async () => {
    try {
      setLoadingUser(true);

      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error || !currentUser) {
        setUser(null);
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

      cachedAdminProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(currentUser);

      if (currentUser?.id) {
        const enabled = await loadPushEnabled(currentUser.id);
        setPushEnabled(enabled);
      }
    } catch (error) {
      console.log("Load admin profile error:", error);
      setUser(null);
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

  const openEditProfile = () => {
    setFullNameDraft(displayName === DEFAULT_ADMIN_PROFILE.fullName ? "" : displayName);
    setEmailDraft(displayEmail === DEFAULT_ADMIN_PROFILE.email ? "" : displayEmail);
    setContactDraft(displayContact === DEFAULT_ADMIN_PROFILE.contact ? "" : displayContact);
    setOfficeDraft(displayOffice === DEFAULT_ADMIN_PROFILE.office ? "" : displayOffice);
    setLocationDraft(
      displayLocation === DEFAULT_ADMIN_PROFILE.location ? "" : displayLocation
    );
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

  const syncProfileRow = async ({
    fullName,
    email,
    contact,
    office,
    location,
    avatarValue,
  }) => {
    if (!user?.id) return;

    await supabase.from("profiles").upsert({
      id: user.id,
      email: email || displayEmail,
      role: "admin",
      full_name: fullName || displayName,
      contact_number: contact || null,
      department: office || null,
      avatar_url: avatarValue || null,
    });
  };

  const pickProfilePhoto = async () => {
    try {
      if (!user?.id) {
        Alert.alert("Account Required", "Please sign in again.");
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
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
        Alert.alert(
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
        Alert.alert(
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
        Alert.alert("Update Failed", error.message);
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

      Alert.alert("Profile Picture Updated", "Your admin picture has been changed.");
    } catch (error) {
      console.log("Admin avatar upload error:", error);
      Alert.alert("Upload Failed", "Unable to update your profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfileChanges = async () => {
    const cleanName = normalizeSpace(fullNameDraft);
    const cleanEmail = normalizeSpace(emailDraft);
    const cleanContact = normalizeSpace(contactDraft);
    const cleanOffice = normalizeSpace(officeDraft);
    const cleanLocation = normalizeSpace(locationDraft);

    if (!cleanName) {
      Alert.alert("Name Required", "Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Email Required", "Please enter your email address.");
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
        Alert.alert("Update Failed", error.message);
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
          Alert.alert("Email Update Failed", emailError.message);
          return;
        }

        Alert.alert(
          "Confirm New Email",
          "We sent a confirmation link to your new email address. Please confirm it before the email change becomes complete."
        );
      } else {
        Alert.alert("Profile Updated", "Your admin information was saved.");
      }

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
      Alert.alert("Update Failed", "Unable to save your profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("Password Required", "Please enter and confirm your password.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        "Weak Password",
        "Your new password must be at least 6 characters."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Password Mismatch", "Your passwords do not match.");
      return;
    }

    try {
      setChangingPassword(true);

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert("Password Update Failed", error.message);
        return;
      }

      Alert.alert(
        "Password Changed",
        "Your password has been updated successfully."
      );

      closePasswordModal();
    } catch {
      Alert.alert("Password Update Failed", "Unable to change your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handlePushToggle = async (value) => {
    if (!user?.id) {
      setPushEnabled(value);
      return;
    }

    const { error } = await updatePushEnabled(user.id, value);

    if (error) {
      Alert.alert(
        "Push Notifications",
        "Unable to update push notification preference."
      );
      return;
    }

    setPushEnabled(value);

    if (value) {
      await registerDevicePushToken(user.id);
    }
  };

  const handlePrivacy = () => {
    Alert.alert(
      "Privacy & Security",
      "CitiSense protects admin accounts by allowing only authorized users to access complaint records, analytics, notifications, and system management tools.\n\n" +
        "Your admin account information is used for identification, access control, and LGU system activity tracking.\n\n" +
        "For security, keep your password private, use a strong password, and always log out when using a shared device."
    );
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await removePushTokensForUser(user?.id);
          const { error } = await supabase.auth.signOut();

          if (error) {
            Alert.alert("Logout Failed", error.message);
            return;
          }

          setUser(null);
          router.replace("/auth/login");
        },
      },
    ]);
  };

  if (!fontsLoaded || loadingUser) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <View style={styles.mainContainer}>
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
          <View style={styles.profileHeroCard}>
            <View style={styles.avatarOuter}>
              <View style={styles.avatarCircle}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={42} color={GREEN} />
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.cameraButton}
                onPress={pickProfilePhoto}
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Ionicons name="camera" size={15} color={WHITE} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.profileMainInfo}>
              <Text style={styles.profileName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.profileRole}>{displayRole}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {displayEmail}
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.editButton}
              onPress={openEditProfile}
            >
              <Feather name="edit-2" size={15} color={GREEN} />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>

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

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Notifications</Text>

            <View style={styles.settingsCard}>
              <SwitchRow
                icon="bell"
                label="Push Notifications"
                description="Receive complaint and system updates."
                value={pushEnabled}
                onValueChange={handlePushToggle}
              />

              <SwitchRow
                icon="mail"
                label="Email Alerts"
                description="Receive important alerts through email."
                value={emailAlertsEnabled}
                onValueChange={setEmailAlertsEnabled}
                last
              />
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Settings</Text>

            <View style={styles.settingsCard}>
              <ActionRow
                icon="lock"
                iconColor={BLUE}
                title="Change Password"
                subtitle="Update your admin account password."
                onPress={() => setPasswordModalVisible(true)}
              />

              <ActionRow
                icon="shield"
                iconColor={GREEN}
                title="Privacy & Security"
                subtitle="Manage your account protection."
                onPress={handlePrivacy}
                last
              />
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={RED} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomNav}>
          {bottomTabs.map((tab) => {
            const isActive =
              pathname?.includes(tab.activePath) ||
              (tab.label === "Profile" && pathname?.includes("adminProfile"));

            return (
              <TouchableOpacity
                key={tab.label}
                style={[styles.navItem, { flex: tab.flex }]}
                activeOpacity={0.7}
                onPress={() => {
                  if (isActive) return;
                  router.replace(tab.route);
                }}
              >
                <View style={styles.navIconWrap}>
                  <Ionicons
                    name={isActive ? tab.activeIcon : tab.inactiveIcon}
                    size={25}
                    color={isActive ? GREEN : TEXT}
                  />

                  {tab.label === "Notifications" &&
                    unreadNotificationCount > 0 && (
                      <View style={styles.notificationNavBadge}>
                        <Text style={styles.notificationNavBadgeText}>
                          {unreadNotificationCount > 99
                            ? "99+"
                            : unreadNotificationCount}
                        </Text>
                      </View>
                    )}
                </View>

                <Text
                  style={[
                    styles.navLabel,
                    {
                      color: isActive ? GREEN : TEXT,
                      fontFamily: isActive
                        ? "Poppins_600SemiBold"
                        : "Poppins_500Medium",
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closeEditProfile}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
              >
                <View style={styles.editSheet}>
                  <View style={styles.modalHandle} />

                  <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>Edit Profile</Text>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={styles.modalCloseButton}
                      onPress={closeEditProfile}
                    >
                      <Feather name="x" size={21} color={TEXT} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.modalScrollContent}
                  >
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <TextInput
                      style={styles.input}
                      value={fullNameDraft}
                      onChangeText={setFullNameDraft}
                      placeholder="Enter full name"
                      placeholderTextColor="#9A9A9A"
                    />

                    <Text style={styles.inputLabel}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      value={emailDraft}
                      onChangeText={setEmailDraft}
                      placeholder="Enter email address"
                      placeholderTextColor="#9A9A9A"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />

                    <Text style={styles.inputLabel}>Contact Number</Text>
                    <TextInput
                      style={styles.input}
                      value={contactDraft}
                      onChangeText={setContactDraft}
                      placeholder="Enter contact number"
                      placeholderTextColor="#9A9A9A"
                      keyboardType="phone-pad"
                    />

                    <Text style={styles.inputLabel}>Office</Text>
                    <TextInput
                      style={styles.input}
                      value={officeDraft}
                      onChangeText={setOfficeDraft}
                      placeholder="Enter office"
                      placeholderTextColor="#9A9A9A"
                    />

                    <Text style={styles.inputLabel}>Location</Text>
                    <TextInput
                      style={styles.input}
                      value={locationDraft}
                      onChangeText={setLocationDraft}
                      placeholder="Enter location"
                      placeholderTextColor="#9A9A9A"
                    />

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.saveButton}
                      onPress={saveProfileChanges}
                      disabled={savingProfile}
                    >
                      {savingProfile ? (
                        <ActivityIndicator size="small" color={WHITE} />
                      ) : (
                        <Text style={styles.saveButtonText}>Save Changes</Text>
                      )}
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
          visible={passwordModalVisible}
          animationType="slide"
          transparent
          onRequestClose={closePasswordModal}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardView}
              >
                <View style={styles.passwordSheet}>
                  <View style={styles.modalHandle} />

                  <View style={styles.modalHeaderRow}>
                    <Text style={styles.modalTitle}>Change Password</Text>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={styles.modalCloseButton}
                      onPress={closePasswordModal}
                    >
                      <Feather name="x" size={21} color={TEXT} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>New Password</Text>
                  <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    placeholderTextColor="#9A9A9A"
                    secureTextEntry
                  />

                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    placeholderTextColor="#9A9A9A"
                    secureTextEntry
                  />

                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.saveButton}
                    onPress={handleChangePassword}
                    disabled={changingPassword}
                  >
                    {changingPassword ? (
                      <ActivityIndicator size="small" color={WHITE} />
                    ) : (
                      <Text style={styles.saveButtonText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value, last }) {
  return (
    <View style={[styles.infoRow, last && styles.noBorder]}>
      <View style={styles.infoIconCircle}>
        <Feather name={icon} size={15} color={GREEN} />
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
        <Feather name={icon} size={15} color={GREEN} />
      </View>

      <View style={styles.settingTextBox}>
        <Text style={styles.settingTitle}>{label}</Text>
        <Text style={styles.settingSubtitle}>{description}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#D5DAD3", true: "#BFE3B5" }}
        thumbColor={value ? GREEN : "#F4F4F4"}
        ios_backgroundColor="#D5DAD3"
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
      <View style={[styles.settingIconCircle, { backgroundColor: "#F7FAF6" }]}>
        <Feather name={icon} size={15} color={iconColor} />
      </View>

      <View style={styles.settingTextBox}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>

      <Feather name="chevron-right" size={20} color={MUTED} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },

  mainContainer: {
    flex: 1,
    backgroundColor: BG,
  },

  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BG,
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
    color: GREEN,
    letterSpacing: 0.1,
  },

  logoTextLight: {
    color: ACCENT_GREEN,
  },

  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 0,
    paddingBottom: 116,
  },

  profileHeroCard: {
    borderRadius: 20,
    backgroundColor: GREEN,
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#000000",
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
    backgroundColor: WHITE,
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
    backgroundColor: RED,
    borderWidth: 2,
    borderColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },

  profileMainInfo: {
    flex: 1,
  },

  profileName: {
    fontFamily: "Poppins_700Bold",
    fontSize: 17,
    color: WHITE,
    lineHeight: 22,
  },

  profileRole: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    color: "rgba(255,255,255,0.85)",
    marginTop: 1,
  },

  profileEmail: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: "rgba(255,255,255,0.78)",
    marginTop: 2,
  },

  editButton: {
    minWidth: 58,
    height: 31,
    borderRadius: 16,
    backgroundColor: WHITE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },

  editButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 10.5,
    color: GREEN,
    marginLeft: 4,
  },

  sectionBlock: {
    marginBottom: 15,
  },

  sectionTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: GREEN,
    marginBottom: 9,
  },

  infoCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 3,
  },

  infoRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1EB",
  },

  infoIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: LIGHT_GREEN,
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
    color: GREEN,
  },

  infoValue: {
    fontFamily: "Poppins_400Regular",
    fontSize: 11.5,
    color: TEXT,
    marginTop: 1,
  },

  settingsCard: {
    borderRadius: 17,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: WHITE,
    paddingHorizontal: 13,
    paddingVertical: 3,
  },

  settingRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1EB",
  },

  settingIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: LIGHT_GREEN,
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
    color: TEXT,
  },

  settingSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.3,
    color: MUTED,
    marginTop: 1,
  },

  noBorder: {
    borderBottomWidth: 0,
  },

  logoutButton: {
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#F2C4C4",
    backgroundColor: "#FFF4F4",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  logoutText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: RED,
    marginLeft: 8,
  },

  bottomNav: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: Platform.OS === "ios" ? -38 : -32,
    height: Platform.OS === "ios" ? 108 : 100,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    shadowColor: "#000000",
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
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  notificationNavBadgeText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 8.5,
    color: WHITE,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },

  keyboardView: {
    width: "100%",
  },

  editSheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
  },

  passwordSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: WHITE,
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 18,
  },

  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "#D7D7D7",
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
    color: GREEN,
  },

  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },

  modalScrollContent: {
    paddingBottom: 12,
  },

  inputLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 12,
    color: GREEN,
    marginBottom: 7,
  },

  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: TEXT,
    marginBottom: 13,
  },

  saveButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },

  saveButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 14,
    color: WHITE,
  },
});

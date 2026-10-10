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
import * as Location from "expo-location";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
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
import { PageSkeleton } from "../../components/skeletons";
import { writeAuditLog } from "../../lib/auditLogService";
import { clearPageCache, getPageCache, setPageCache } from "../../lib/pageDataCache";
import { setProfileAvatarUrl } from "../../lib/profileAvatarStore";
import { syncOwnProfileRow } from "../../lib/syncOwnProfile";
import { supabase } from "../../lib/supabase";
import { notify } from "../../lib/toast";
import {
  loadLocationPreference,
  saveLocationPreference,
} from "../../lib/locationPreferences";
import {
  loadPushEnabled,
  registerDevicePushToken,
  removePushTokensForUser,
  updatePushEnabled,
} from "../../lib/pushNotifications";
import useDepartmentHeadUnreadNotifications from "../../hooks/useDepartmentHeadUnreadNotifications";
import { BOTTOM_NAV_CONTENT_INSET, useHideBottomNav } from "../../components/PersistentBottomNav";

// ===== [DEPT PROFILE] Constants: colors, layout, storage, defaults =====

const H_PADDING = 20;
const PROFILE_SHEET_MAX_HEIGHT = Math.round(Dimensions.get("screen").height * 0.9);
const AVATAR_BUCKET = "avatars";
const DEPT_PROFILE_CACHE_KEY = "departmentHead.profile";

const MAIN_LOGO = require("../../assets/images/mainlogo.png");

const DEFAULT_DEPARTMENT = "City Engineering Office";
const PROFILE_TABLE = "profiles";

const DEFAULT_PROFILE_INFO = {
  name: "Department Head User",
  email: "departmenthead@example.com",
  contact: "Not set",
  department: DEFAULT_DEPARTMENT,
  avatarUrl: null,
};

// ===== [DEPT PROFILE] Module-level caches (persist across remounts) =====
let cachedDepartmentHeadProfile = DEFAULT_PROFILE_INFO;
let cachedLocationEnabled = false;
let hasCheckedLocationPermission = false;

// ===== [DEPT PROFILE] Bottom tab config =====
const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/departmentHead/dashboard",
    activePath: "departmentHead/dashboard",
    flex: 0.82,
  },
  {
    label: "Assigned Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/departmentHead/assignedComplaints",
    activePath: "departmentHead/assignedComplaints",
    flex: 1.55,
  },
  {
    label: "Notifications",
    activeIcon: "notifications",
    inactiveIcon: "notifications-outline",
    route: "/departmentHead/notification",
    activePath: "departmentHead/notification",
    flex: 1.15,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/departmentHead/profile",
    activePath: "departmentHead/profile",
    flex: 0.82,
  },
];

// ===== [DEPT PROFILE] Helpers: image extension, build profile info =====
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

  if (fileName.endsWith(".jpg") || uri.endsWith(".jpg")) {
    return "jpg";
  }

  return "jpeg";
}

function buildDepartmentHeadProfileInfo(currentUser, databaseProfile = null) {
  const metadata = currentUser?.user_metadata || {};
  const authEmail = currentUser?.email || "";

  return {
    name:
      databaseProfile?.full_name ||
      databaseProfile?.name ||
      databaseProfile?.username ||
      metadata.full_name ||
      metadata.name ||
      metadata.username ||
      authEmail?.split("@")[0] ||
      cachedDepartmentHeadProfile.name,

    email:
      databaseProfile?.email ||
      authEmail ||
      cachedDepartmentHeadProfile.email ||
      DEFAULT_PROFILE_INFO.email,

    contact:
      databaseProfile?.contact_number ||
      databaseProfile?.phone_number ||
      databaseProfile?.phone ||
      metadata.contact_number ||
      cachedDepartmentHeadProfile.contact ||
      DEFAULT_PROFILE_INFO.contact,

    department:
      databaseProfile?.department ||
      databaseProfile?.assigned_office ||
      databaseProfile?.office ||
      databaseProfile?.department_name ||
      metadata.department ||
      metadata.assigned_office ||
      metadata.office ||
      metadata.department_name ||
      cachedDepartmentHeadProfile.department ||
      DEFAULT_DEPARTMENT,

    avatarUrl:
      databaseProfile?.avatar_url ||
      databaseProfile?.profile_photo_url ||
      metadata.avatar_url ||
      cachedDepartmentHeadProfile.avatarUrl ||
      null,
  };
}

// ===== [DEPT PROFILE] Screen component =====
export default function DepartmentHeadProfile() {
  // --- [DEPT PROFILE] Navigation, insets & unread count ---
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 8);
  const { unreadNotificationCount } = useDepartmentHeadUnreadNotifications();

  // --- [DEPT PROFILE] State: profile, modals, drafts, toggles ---
  const cachedPage = getPageCache(DEPT_PROFILE_CACHE_KEY);
  const [user, setUser] = useState(cachedPage?.user ?? null);
  const [profileInfo, setProfileInfo] = useState(
    cachedPage?.profileInfo ?? cachedDepartmentHeadProfile
  );

  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [auditLogsVisible, setAuditLogsVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);

  useHideBottomNav(
    editModalVisible || passwordModalVisible || privacyVisible
  );

  const [fullNameDraft, setFullNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pushEnabled, setPushEnabled] = useState(
    cachedPage?.pushEnabled ?? true
  );
  const [locationEnabled, setLocationEnabled] = useState(
    cachedPage?.locationEnabled ?? cachedLocationEnabled
  );

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const displayName = profileInfo.name;
  const displayEmail = profileInfo.email;
  const displayContact = profileInfo.contact;
  const displayDepartment = profileInfo.department;
  const avatarUrl = profileInfo.avatarUrl;

  // --- [DEPT PROFILE] Load profile (auth user + profiles table) ---
  const loadUser = useCallback(async () => {
    try {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error || !currentUser) return;

      let databaseProfile = null;
      const authEmail = currentUser.email || "";

      if (authEmail) {
        const { data: profileData, error: profileError } = await supabase
          .from(PROFILE_TABLE)
          .select("*")
          .ilike("email", authEmail)
          .maybeSingle();

        if (profileError) {
          console.log("Department head profile database load error:", profileError);
        }

        databaseProfile = profileData || null;
      }

      const nextProfileInfo = buildDepartmentHeadProfileInfo(
        currentUser,
        databaseProfile
      );

      cachedDepartmentHeadProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(currentUser);
      if (nextProfileInfo.avatarUrl) {
        setProfileAvatarUrl(nextProfileInfo.avatarUrl);
      }

      let enabled = getPageCache(DEPT_PROFILE_CACHE_KEY)?.pushEnabled ?? true;
      if (currentUser?.id) {
        enabled = await loadPushEnabled(currentUser.id);
        setPushEnabled(enabled);
      }

      const previousCache = getPageCache(DEPT_PROFILE_CACHE_KEY) || {};
      setPageCache(DEPT_PROFILE_CACHE_KEY, {
        ...previousCache,
        user: currentUser,
        profileInfo: nextProfileInfo,
        pushEnabled: enabled,
      });
    } catch (error) {
      console.log("Load department head profile error:", error);
      // Keep cached profile to avoid UI jumping.
    }
  }, []);

  // --- [DEPT PROFILE] Location preference check ---
  const checkLocationPermission = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    try {
      const enabled = await loadLocationPreference(user.id);
      cachedLocationEnabled = enabled;
      hasCheckedLocationPermission = true;
      setLocationEnabled(enabled);
      const previousCache = getPageCache(DEPT_PROFILE_CACHE_KEY) || {};
      setPageCache(DEPT_PROFILE_CACHE_KEY, {
        ...previousCache,
        locationEnabled: enabled,
      });
    } catch {
      setLocationEnabled(cachedLocationEnabled);
    }
  }, [user?.id]);

  // --- [DEPT PROFILE] Reload on focus ---
  useFocusEffect(
    useCallback(() => {
      loadUser();
      checkLocationPermission();
    }, [loadUser, checkLocationPermission])
  );

  // --- [DEPT PROFILE] Realtime: profile row changes ---
  useEffect(() => {
    const authEmail = user?.email;

    if (!authEmail) return;

    const channel = supabase
      .channel(`moderator-profile-department-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PROFILE_TABLE,
          filter: `email=eq.${authEmail}`,
        },
        (payload) => {
          if (!payload.new) return;

          const nextProfileInfo = buildDepartmentHeadProfileInfo(user, payload.new);

          cachedDepartmentHeadProfile = nextProfileInfo;
          setProfileInfo(nextProfileInfo);
        }
      )
      .subscribe((status) => {
        console.log("Moderator profile realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const metadata = user?.user_metadata || {};

  // --- [DEPT PROFILE] Edit / password modal open & close ---
  const openEditProfile = () => {
    setFullNameDraft(displayName === "Department Head User" ? "" : displayName);
    setEmailDraft(displayEmail === "departmenthead@example.com" ? "" : displayEmail);
    setContactDraft(displayContact === "Not set" ? "" : displayContact);
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

  // --- [DEPT PROFILE] Location permission toggle ---
  const handleLocationToggle = async (value) => {
    if (value) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (permission.status === "granted") {
          cachedLocationEnabled = true;
          hasCheckedLocationPermission = true;
          setLocationEnabled(true);

          if (user?.id) {
            await saveLocationPreference(user.id, true);
          }

          notify(
            "Location Services Enabled",
            "CitiSense can now use your location for map routing, pinned complaint navigation, and department head location tracking."
          );
          writeAuditLog({
            action: "location_preference",
            title: "Location Services Enabled",
            description: "Location access was turned on for map routing and tracking.",
            actorRole: "moderator",
          });
        } else {
          cachedLocationEnabled = false;
          hasCheckedLocationPermission = true;
          setLocationEnabled(false);

          if (user?.id) {
            await saveLocationPreference(user.id, false);
          }

          notify(
            "Location Permission Denied",
            "Location access was not allowed. You can enable it later in your phone settings."
          );
        }
      } catch {
        setLocationEnabled(cachedLocationEnabled);

        notify(
          "Location Error",
          "Unable to request location permission right now."
        );
      }

      return;
    }

    cachedLocationEnabled = false;
    hasCheckedLocationPermission = true;
    setLocationEnabled(false);

    if (user?.id) {
      await saveLocationPreference(user.id, false);
    }

    notify(
      "Location Services",
      "Location tracking is turned off in the app. To fully disable phone permission, turn off CitiSense location access in your phone settings."
    );
    writeAuditLog({
      action: "location_preference",
      title: "Location Services Disabled",
      description: "Location access was turned off in the app.",
      actorRole: "moderator",
    });
  };

  // --- [DEPT PROFILE] Profile photo upload ---
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

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);

      const nextMetadata = {
        ...metadata,
        avatar_url: publicUrl,
      };

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        notify("Update Failed", error.message);
        return;
      }

      const nextProfileInfo = {
        name: nextMetadata.full_name || displayName,
        email: displayEmail,
        contact: nextMetadata.contact_number || displayContact,
        department: nextMetadata.department || displayDepartment,
        avatarUrl: publicUrl,
      };

      cachedDepartmentHeadProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setProfileAvatarUrl(publicUrl);

      await syncOwnProfileRow({
        userId: user.id,
        fullName: nextProfileInfo.name,
        email: nextProfileInfo.email,
        contactNumber:
          nextProfileInfo.contact === "Not set"
            ? null
            : nextProfileInfo.contact,
        department: nextProfileInfo.department,
        avatarUrl: publicUrl,
      });

      try {
        await supabase.from("moderator_profiles").upsert({
          id: user.id,
          full_name: nextProfileInfo.name,
          email: nextProfileInfo.email,
          contact_number:
            nextProfileInfo.contact === "Not set"
              ? null
              : nextProfileInfo.contact,
          department: nextProfileInfo.department,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Optional moderator_profiles table sync only.
      }

      setUser(data?.user || user);
      notify("Profile Picture Updated", "Your picture has been changed.");
      await writeAuditLog({
        action: "avatar_update",
        title: "Profile Picture Updated",
        description: "Department head profile picture was changed.",
        actorRole: "moderator",
      });
    } catch {
      notify("Upload Failed", "Unable to update your profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // --- [DEPT PROFILE] Edit profile: save changes ---
  const saveProfileChanges = async () => {
    const cleanName = fullNameDraft.trim();
    const cleanEmail = emailDraft.trim();
    const cleanContact = contactDraft.trim();

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
        department: displayDepartment,
      };

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        notify("Update Failed", error.message);
        return;
      }

      const emailChanged =
        cleanEmail.toLowerCase() !== displayEmail.toLowerCase();

      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: cleanEmail,
        });

        if (emailError) {
          notify("Email Update Failed", emailError.message);
          return;
        }
      }

      const nextProfileInfo = {
        name: cleanName,
        email: cleanEmail,
        contact: cleanContact || "Not set",
        department: displayDepartment,
        avatarUrl: avatarUrl,
      };

      cachedDepartmentHeadProfile = nextProfileInfo;
      setProfileInfo(nextProfileInfo);
      setUser(data?.user || user);

      await syncOwnProfileRow({
        userId: user?.id,
        fullName: cleanName,
        email: cleanEmail,
        contactNumber: cleanContact || null,
        department: displayDepartment,
        avatarUrl: avatarUrl || null,
      });

      try {
        await supabase.from("moderator_profiles").upsert({
          id: user?.id,
          full_name: cleanName,
          email: cleanEmail,
          contact_number: cleanContact || null,
          department: displayDepartment,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Optional moderator_profiles table sync only.
      }

      setEditModalVisible(false);

      if (emailChanged) {
        notify(
          "Confirm New Email",
          "We sent a confirmation link to your new email address. Please confirm it before the email change becomes complete."
        );
      } else {
        notify("Profile Updated", "Your department head information was saved.");
      }

      await writeAuditLog({
        action: "profile_update",
        title: "Profile Updated",
        description: "Department head account information was updated.",
        actorRole: "moderator",
        actorName: cleanName,
      });
    } catch {
      notify("Update Failed", "Unable to save your profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  // --- [DEPT PROFILE] Change password ---
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
        description: "Department head account password was updated.",
        actorRole: "moderator",
      });

      closePasswordModal();
    } catch {
      notify("Password Update Failed", "Unable to change your password.");
    } finally {
      setChangingPassword(false);
    }
  };

  // --- [DEPT PROFILE] Push notifications toggle ---
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
      actorRole: "moderator",
    });

    if (value) {
      await registerDevicePushToken(user.id);
    }
  };

  // --- [DEPT PROFILE] Settings handlers: privacy, logout ---
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
            description: "Department head signed out of CitiSense.",
            actorRole: "moderator",
          });
          await removePushTokensForUser(user?.id);
          const { error } = await supabase.auth.signOut();

          if (error) {
            notify("Logout Failed", error.message);
            return;
          }

          void clearPageCache();

          cachedDepartmentHeadProfile = DEFAULT_PROFILE_INFO;
          cachedLocationEnabled = false;
          hasCheckedLocationPermission = false;

          setProfileInfo(DEFAULT_PROFILE_INFO);
          setLocationEnabled(false);
          setUser(null);

          router.replace("/auth/login");
        },
      },
    ]);
  };

  // --- [DEPT PROFILE] Render ---
  if (!fontsLoaded && !cachedPage) {
    return <PageSkeleton variant="profile" />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="rgba(247, 250, 246, 1)" />

      <View style={styles.mainContainer}>
        {/* [DEPT PROFILE UI] Header: CitiSense logo */}
        <View style={styles.fixedHeader}>
          <View style={styles.logoRow}>
            <Image source={MAIN_LOGO} style={styles.mainLogoImage} />

            <Text style={styles.logoText}>
              Citi<Text style={styles.logoTextLight}>Sense</Text>
            </Text>
          </View>
        </View>

        {/* [DEPT PROFILE UI] Scrollable profile content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* [DEPT PROFILE UI] Profile card: avatar, name, edit button */}
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
              <Text style={styles.profileRole}>Department Head</Text>
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

          {/* [DEPT PROFILE UI] Account information rows */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Account Information</Text>

            <View style={styles.infoCard}>
              <InfoRow icon="mail" label="Email Address" value={displayEmail} />

              <InfoRow
                icon="phone"
                label="Contact Number"
                value={displayContact}
              />

              <InfoRow
                icon="briefcase"
                label="Department"
                value={displayDepartment}
                last
              />
            </View>
          </View>

          {/* [DEPT PROFILE UI] Notifications settings */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Notifications</Text>

            <View style={styles.settingsCard}>
              <SwitchRow
                icon="bell"
                label="Push Notifications"
                description="Receive assigned complaint updates."
                value={pushEnabled}
                onValueChange={handlePushToggle}
                last
              />
            </View>
          </View>

          {/* [DEPT PROFILE UI] Location services settings */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Location Services</Text>

            <View style={styles.settingsCard}>
              <SwitchRow
                icon="map-pin"
                label="Location Services"
                description="Use location for map route tracking."
                value={locationEnabled}
                onValueChange={handleLocationToggle}
                last
              />
            </View>
          </View>

          {/* [DEPT PROFILE UI] Settings list: password, audit logs, privacy */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Settings</Text>

            <View style={styles.settingsCard}>
              <ActionRow
                icon="lock"
                iconColor="rgba(49, 90, 154, 1)"
                title="Change Password"
                subtitle="Update your department head password."
                onPress={() => setPasswordModalVisible(true)}
              />

              <ActionRow
                icon="activity"
                iconColor="rgba(49, 90, 154, 1)"
                title="Audit Logs"
                subtitle="View your recent account activity."
                onPress={() => setAuditLogsVisible(true)}
              />

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

          {/* [DEPT PROFILE UI] Log out button */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color="rgba(215, 25, 32, 1)" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* [DEPT PROFILE UI] Edit profile modal */}
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
                bottomOffset={24}
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

                <View style={styles.readOnlyInfoBox}>
                  <Text style={styles.readOnlyLabel}>Department</Text>
                  <Text style={styles.readOnlyValue}>{displayDepartment}</Text>
                </View>

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

        {/* [DEPT PROFILE UI] Change password modal */}
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

        {/* [DEPT PROFILE UI] Audit logs modal */}
        <AuditLogsModal
          visible={auditLogsVisible}
          onClose={() => setAuditLogsVisible(false)}
        />

        {/* [DEPT PROFILE UI] Privacy & security modal */}
        <PrivacySecurityModal
          visible={privacyVisible}
          onClose={() => setPrivacyVisible(false)}
          role="departmentHead"
        />
      </View>
    </SafeAreaView>
  );
}

// ===== [DEPT PROFILE] Subcomponents: InfoRow, SwitchRow, ActionRow =====
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

// ===== [DEPT PROFILE] Styles =====
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
    backgroundColor: "rgba(9, 122, 14, 1)",
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

  // --- Sections & info rows ---
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

  // --- Settings rows ---
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

  // --- Log out ---
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
    alignItems: "center",
    justifyContent: "center",
    minWidth: 30,
    minHeight: 30,
  },

  notificationNavBadge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 18,
    height: 18,
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
    lineHeight: 11,
    textAlign: "center",
  },

  navLabel: {
    fontSize: 9.4,
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    includeFontPadding: false,
  },

  // --- Modals & form inputs ---
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

  readOnlyInfoBox: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(191, 227, 181, 1)",
    backgroundColor: "rgba(252, 255, 251, 1)",
    paddingHorizontal: 13,
    paddingVertical: 10,
    marginBottom: 13,
  },

  readOnlyLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 11,
    color: "rgba(8, 122, 13, 1)",
  },

  readOnlyValue: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 12,
    color: "rgba(23, 23, 23, 1)",
    marginTop: 2,
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
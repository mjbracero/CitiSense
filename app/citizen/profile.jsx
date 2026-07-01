import { Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { decode } from "base64-arraybuffer";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  loadLocationPreference,
  saveLocationPreference,
} from "../../lib/locationPreferences";
import {
  loadPushEnabled,
  registerDevicePushToken,
  removePushTokensForUser,
  updatePushEnabled,
} from "../../lib/pushNotifications";

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

const fallbackBarangays = [
  "Anonang Norte",
  "Anonang Sur",
  "Banban",
  "Binabag",
  "Bungtod",
  "Carbon",
  "Cayang",
  "Dakit",
  "Don Pedro Rodriguez",
  "Gairan",
  "Guadalupe",
  "La Paz",
  "La Purisima Concepcion",
  "Libertad",
  "Malingin",
  "Marangog",
  "Nailon",
  "Odlot",
  "Pandan",
  "Polambato",
  "Sambag",
  "San Vicente",
  "Siocon",
  "Sudlonon",
  "Taytayan",
];

const bottomTabs = [
  {
    label: "Home",
    activeIcon: "home",
    inactiveIcon: "home-outline",
    route: "/citizen/dashboard",
    activePath: "citizen/dashboard",
    flex: 0.9,
  },
  {
    label: "Submit",
    activeIcon: "add-circle",
    inactiveIcon: "add-circle-outline",
    route: "/citizen/submit",
    activePath: "citizen/submit",
    flex: 0.9,
  },
  {
    label: "My Complaints",
    activeIcon: "document-text",
    inactiveIcon: "document-text-outline",
    route: "/citizen/complaints",
    activePath: "citizen/complaints",
    flex: 1.45,
  },
  {
    label: "Profile",
    activeIcon: "person",
    inactiveIcon: "person-outline",
    route: "/citizen/profile",
    activePath: "citizen/profile",
    flex: 0.9,
  },
];

function getBarangayName(row) {
  return (
    row?.name ||
    row?.barangay_name ||
    row?.barangay ||
    row?.title ||
    row?.label ||
    ""
  );
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

  if (fileName.endsWith(".jpg") || uri.endsWith(".jpg")) {
    return "jpg";
  }

  return "jpeg";
}

export default function CitizenProfile() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [barangayModalVisible, setBarangayModalVisible] = useState(false);

  const [barangays, setBarangays] = useState(fallbackBarangays);

  const [fullNameDraft, setFullNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [barangayDraft, setBarangayDraft] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [pushEnabled, setPushEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const loadBarangays = async () => {
    try {
      const { data, error } = await supabase
        .from("barangays")
        .select("*")
        .order("name", { ascending: true });

      if (error || !Array.isArray(data) || data.length === 0) {
        setBarangays(fallbackBarangays);
        return;
      }

      const mappedBarangays = data
        .map(getBarangayName)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      setBarangays(
        mappedBarangays.length > 0 ? mappedBarangays : fallbackBarangays
      );
    } catch {
      setBarangays(fallbackBarangays);
    }
  };

  const loadUser = async () => {
    try {
      setLoadingUser(true);

      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (error) {
        setUser(null);
        return;
      }

      setUser(currentUser);

      if (currentUser?.id) {
        const enabled = await loadPushEnabled(currentUser.id);
        setPushEnabled(enabled);
      }
    } catch {
      setUser(null);
    } finally {
      setLoadingUser(false);
    }
  };

  const checkLocationPermission = async () => {
    try {
      if (!user?.id) {
        setLocationEnabled(false);
        return;
      }

      const enabled = await loadLocationPreference(user.id);
      setLocationEnabled(enabled);
    } catch {
      setLocationEnabled(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadUser();
      loadBarangays();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        checkLocationPermission();
      }
    }, [user?.id])
  );

  const metadata = user?.user_metadata || {};

  const displayName = useMemo(() => {
    const metadataName =
      metadata.full_name || metadata.name || metadata.username;

    if (metadataName) return metadataName;

    if (user?.email) return user.email.split("@")[0];

    return "Citizen User";
  }, [metadata, user]);

  const displayEmail = user?.email || "citizen@example.com";
  const displayContact = metadata.contact_number || "Not set";
  const displayBarangay = metadata.barangay || "Not set";
  const avatarUrl = metadata.avatar_url || null;

  const openEditProfile = () => {
    setFullNameDraft(displayName === "Citizen User" ? "" : displayName);
    setEmailDraft(displayEmail === "citizen@example.com" ? "" : displayEmail);
    setContactDraft(displayContact === "Not set" ? "" : displayContact);
    setBarangayDraft(displayBarangay === "Not set" ? "" : displayBarangay);
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

  const handleLocationToggle = async (value) => {
    if (value) {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();

        if (permission.status === "granted") {
          setLocationEnabled(true);

          if (user?.id) {
            await saveLocationPreference(user.id, true);
          }

          Alert.alert(
            "Location Services Enabled",
            "CitiSense can now use your location to help attach accurate location details when submitting complaints."
          );
        } else {
          setLocationEnabled(false);

          if (user?.id) {
            await saveLocationPreference(user.id, false);
          }

          Alert.alert(
            "Location Permission Denied",
            "Location access was not allowed. You can enable it later in your phone settings."
          );
        }
      } catch {
        setLocationEnabled(false);
        Alert.alert(
          "Location Error",
          "Unable to request location permission right now."
        );
      }

      return;
    }

    setLocationEnabled(false);

    if (user?.id) {
      await saveLocationPreference(user.id, false);
    }

    Alert.alert(
      "Location Services",
      "Location access is turned off in the app. To fully disable phone permission, turn off CitiSense location access in your phone settings."
    );
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
        Alert.alert("Update Failed", error.message);
        return;
      }

      try {
        await supabase.from("citizen_profiles").upsert({
          id: user.id,
          full_name: metadata.full_name || displayName,
          email: displayEmail,
          contact_number: metadata.contact_number || null,
          barangay: metadata.barangay || null,
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Optional profile table sync only.
      }

      setUser(data?.user || user);
      Alert.alert("Profile Picture Updated", "Your picture has been changed.");
    } catch {
      Alert.alert("Upload Failed", "Unable to update your profile picture.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfileChanges = async () => {
    const cleanName = fullNameDraft.trim();
    const cleanEmail = emailDraft.trim();
    const cleanContact = contactDraft.trim();
    const cleanBarangay = barangayDraft.trim();

    if (!cleanName) {
      Alert.alert("Name Required", "Please enter your full name.");
      return;
    }

    if (!cleanEmail) {
      Alert.alert("Email Required", "Please enter your email address.");
      return;
    }

    if (!cleanBarangay) {
      Alert.alert("Barangay Required", "Please select your barangay.");
      return;
    }

    try {
      setSavingProfile(true);

      const nextMetadata = {
        ...metadata,
        full_name: cleanName,
        contact_number: cleanContact,
        barangay: cleanBarangay,
      };

      const { data, error } = await supabase.auth.updateUser({
        data: nextMetadata,
      });

      if (error) {
        Alert.alert("Update Failed", error.message);
        return;
      }

      setUser(data?.user || user);

      try {
        await supabase.from("citizen_profiles").upsert({
          id: user?.id,
          full_name: cleanName,
          email: displayEmail,
          contact_number: cleanContact,
          barangay: cleanBarangay,
          avatar_url: metadata.avatar_url || null,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Optional profile table sync only.
      }

      const emailChanged =
        cleanEmail.toLowerCase() !== displayEmail.toLowerCase();

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
          "We sent a confirmation link to your new email address. Open Gmail or your email inbox and confirm it before the email change becomes complete."
        );
      } else {
        Alert.alert("Profile Updated", "Your account information was saved.");
      }

      setEditModalVisible(false);
      loadUser();
    } catch {
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
      "CitiSense protects your account and complaint records by allowing only authorized users to access submitted reports.\n\n" +
        "Your account information such as name, email, contact number, barangay, and profile photo is used only for identification, complaint updates, and LGU communication.\n\n" +
        "Your uploaded complaint photos and location details are used as evidence to help the LGU verify, classify, and process your complaint properly.\n\n" +
        "Location services are used to help attach accurate complaint location details when submitting reports.\n\n" +
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
              <Text style={styles.profileRole}>Citizen Account</Text>
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

              <InfoRow
                icon="map-pin"
                label="Barangay"
                value={displayBarangay}
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
                description="Receive complaint updates."
                value={pushEnabled}
                onValueChange={handlePushToggle}
                last
              />
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Location Services</Text>

            <View style={styles.settingsCard}>
              <SwitchRow
                icon="map-pin"
                label="Location Services"
                description="Use location for accurate complaint reports."
                value={locationEnabled}
                onValueChange={handleLocationToggle}
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
                subtitle="Update your account password."
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
              (tab.label === "Profile" &&
                pathname?.includes("citizenProfile"));

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
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={26}
                  color={isActive ? GREEN : TEXT}
                />

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

                    <Text style={styles.inputLabel}>Barangay</Text>
                    <TouchableOpacity
                      activeOpacity={0.75}
                      style={styles.selectInput}
                      onPress={() => setBarangayModalVisible(true)}
                    >
                      <Text
                        style={[
                          styles.selectInputText,
                          !barangayDraft && styles.placeholderText,
                        ]}
                      >
                        {barangayDraft || "Select barangay"}
                      </Text>

                      <Feather name="chevron-down" size={19} color={MUTED} />
                    </TouchableOpacity>

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

        <Modal
          visible={barangayModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setBarangayModalVisible(false)}
        >
          <View style={styles.centerModalOverlay}>
            <View style={styles.barangayModalBox}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Select Barangay</Text>

                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.modalCloseButton}
                  onPress={() => setBarangayModalVisible(false)}
                >
                  <Feather name="x" size={21} color={TEXT} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {barangays.map((barangay) => (
                  <TouchableOpacity
                    key={barangay}
                    activeOpacity={0.75}
                    style={[
                      styles.barangayOption,
                      barangayDraft === barangay &&
                        styles.barangayOptionActive,
                    ]}
                    onPress={() => {
                      setBarangayDraft(barangay);
                      setBarangayModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.barangayOptionText,
                        barangayDraft === barangay &&
                          styles.barangayOptionTextActive,
                      ]}
                    >
                      {barangay}
                    </Text>

                    {barangayDraft === barangay && (
                      <Feather name="check" size={18} color={GREEN} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
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

  navLabel: {
    fontSize: 9.4,
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

  selectInput: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingHorizontal: 13,
    marginBottom: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  selectInputText: {
    flex: 1,
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: TEXT,
  },

  placeholderText: {
    color: "#9A9A9A",
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

  centerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  barangayModalBox: {
    width: "100%",
    maxHeight: "72%",
    borderRadius: 22,
    backgroundColor: WHITE,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  barangayOption: {
    minHeight: 45,
    borderRadius: 13,
    paddingHorizontal: 12,
    marginBottom: 7,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  barangayOptionActive: {
    backgroundColor: LIGHT_GREEN,
    borderColor: "#BFE3B5",
  },

  barangayOptionText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    color: TEXT,
  },

  barangayOptionTextActive: {
    fontFamily: "Poppins_700Bold",
    color: GREEN,
  },
});
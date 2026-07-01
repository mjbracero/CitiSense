import { Feather, Ionicons } from "@expo/vector-icons";
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  useFonts,
} from "@expo-google-fonts/poppins";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ComplaintMapView from "../../components/ComplaintMapView";
import { resolveExactAddress } from "../../lib/addressUtils";
import { isInsideBogoCity } from "../../lib/bogoCityBounds";
import { isLocationUsageAllowed } from "../../lib/locationPreferences";
import { setPendingLocationEdit } from "../../lib/locationEditStore";
import { supabase } from "../../lib/supabase";
import { HEADER_TOP_SPACING } from "../../constants/screenLayout";

const GREEN = "#087A0D";
const WHITE = "#FFFFFF";
const TEXT = "#171717";
const MUTED = "#6F776F";

function warnOutsideBogoCity() {
  Alert.alert(
    "Outside Bogo City",
    "Please pin your complaint location within Bogo City, Cebu only."
  );
}

export default function EditComplaintLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const mapRef = useRef(null);

  const initialLatitude = Number(params.latitude);
  const initialLongitude = Number(params.longitude);

  const [draftLocation, setDraftLocation] = useState({
    latitude: Number.isFinite(initialLatitude) ? initialLatitude : 11.0517,
    longitude: Number.isFinite(initialLongitude) ? initialLongitude : 124.0055,
  });
  const [locationText, setLocationText] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const updateAddressFromCoords = useCallback(async (coords) => {
    const nextAddress = await resolveExactAddress(
      coords.latitude,
      coords.longitude
    );

    if (nextAddress) {
      setLocationText(nextAddress);
      return nextAddress;
    }

    const fallback = `Lat ${coords.latitude.toFixed(5)}, Long ${coords.longitude.toFixed(5)}`;
    setLocationText(fallback);
    return fallback;
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        setMapReady(true);
      });
    });

    return () => task.cancel();
  }, []);

  useEffect(() => {
    updateAddressFromCoords(draftLocation);
  }, [draftLocation.latitude, draftLocation.longitude, updateAddressFromCoords]);

  const handleCoordinateChange = (coords) => {
    if (!isInsideBogoCity(coords.latitude, coords.longitude)) {
      warnOutsideBogoCity();
      mapRef.current?.resetMarker(
        draftLocation.longitude,
        draftLocation.latitude
      );
      return;
    }

    const nextCoords = {
      latitude: coords.latitude,
      longitude: coords.longitude,
    };

    setDraftLocation(nextCoords);
  };

  const locateUser = async () => {
    try {
      setIsLocating(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id || !(await isLocationUsageAllowed(user.id))) {
        Alert.alert(
          "Location Disabled",
          "Turn on location services in your profile to use your current location."
        );
        return;
      }

      const permission = await Location.getForegroundPermissionsAsync();

      if (permission.status !== "granted") {
        Alert.alert(
          "Location Permission Needed",
          "Please allow location access so we can pin your complaint location."
        );
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const nextCoords = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      };

      if (!isInsideBogoCity(nextCoords.latitude, nextCoords.longitude)) {
        warnOutsideBogoCity();
        return;
      }

      setDraftLocation(nextCoords);
      mapRef.current?.flyToLocation(nextCoords.longitude, nextCoords.latitude);
    } catch {
      Alert.alert(
        "Location Error",
        "Unable to detect your current location. Please tap the map manually."
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleConfirm = async () => {
    if (!isInsideBogoCity(draftLocation.latitude, draftLocation.longitude)) {
      warnOutsideBogoCity();
      return;
    }

    setIsSaving(true);

    let finalAddress = locationText;

    if (!finalAddress) {
      finalAddress = await resolveExactAddress(
        draftLocation.latitude,
        draftLocation.longitude
      );
    }

    setPendingLocationEdit({
      latitude: draftLocation.latitude,
      longitude: draftLocation.longitude,
      locationText:
        finalAddress ||
        `Lat ${draftLocation.latitude.toFixed(5)}, Long ${draftLocation.longitude.toFixed(5)}`,
    });

    setIsSaving(false);

    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/citizen/submit");
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/citizen/submit");
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={handleBack}
        >
          <Feather name="chevron-left" size={26} color={TEXT} />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Edit Location</Text>
          <Text style={styles.headerSubtitle}>
            Tap the map to pin your complaint within Bogo City, Cebu
          </Text>
        </View>

        <TouchableOpacity
          style={styles.myLocationButton}
          activeOpacity={0.7}
          onPress={locateUser}
          disabled={isLocating}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color={GREEN} />
          ) : (
            <Ionicons name="navigate" size={20} color={GREEN} />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrapper}>
        {mapReady ? (
          <ComplaintMapView
            ref={mapRef}
            latitude={draftLocation.latitude}
            longitude={draftLocation.longitude}
            style={styles.map}
            interactive
            onCoordinateChange={handleCoordinateChange}
          />
        ) : (
          <View style={styles.mapLoader}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.mapLoaderText}>Loading map...</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomSheet}>
        <Text style={styles.sectionLabel}>Exact Address</Text>
        <Text style={styles.addressText}>
          {locationText || "Detecting address for pinned location..."}
        </Text>

        <Text style={styles.coordinatesText}>
          Lat {draftLocation.latitude.toFixed(6)} • Long{" "}
          {draftLocation.longitude.toFixed(6)}
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.confirmButton, isSaving && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={WHITE} />
              <Text style={styles.confirmButtonText}>Confirm Location</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WHITE,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WHITE,
  },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: HEADER_TOP_SPACING,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDE8",
    backgroundColor: WHITE,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#F1F4F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  headerTextBox: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: "Poppins_700Bold",
    fontSize: 18,
    color: TEXT,
  },
  headerSubtitle: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 2,
  },
  myLocationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EAF6E4",
    alignItems: "center",
    justifyContent: "center",
  },
  mapWrapper: {
    flex: 1,
    backgroundColor: "#E8E8E8",
  },
  mapLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F3",
  },
  mapLoaderText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 12,
    color: MUTED,
    marginTop: 10,
  },
  map: {
    flex: 1,
  },
  bottomSheet: {
    backgroundColor: WHITE,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 24 : 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  sectionLabel: {
    fontFamily: "Poppins_700Bold",
    fontSize: 13,
    color: GREEN,
    marginBottom: 4,
  },
  addressText: {
    fontFamily: "Poppins_500Medium",
    fontSize: 12.5,
    color: TEXT,
    lineHeight: 18,
  },
  coordinatesText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 10.5,
    color: MUTED,
    marginTop: 8,
    marginBottom: 14,
  },
  confirmButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.75,
  },
  confirmButtonText: {
    fontFamily: "Poppins_700Bold",
    fontSize: 15,
    color: WHITE,
  },
});

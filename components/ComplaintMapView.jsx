import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import WebView from "./AppWebView";
import {
  createMaplibreMapHtml,
  getMaplibreStyleUrl,
} from "../lib/maplibreMapHtml";

// ===== [MAP VIEW] MapLibre WebView map component (forwardRef) =====
const ComplaintMapView = forwardRef(function ComplaintMapView(
  {
    latitude,
    longitude,
    style,
    interactive = false,
    panEnabled = false,
    panZoomEnabled = false,
    onCoordinateChange,
  },
  ref
) {
  // --- [MAP VIEW] Refs, coordinate & map HTML ---
  const webViewRef = useRef(null);
  const isMapReadyRef = useRef(false);

  const coordinate = useMemo(
    () => ({
      latitude: Number(latitude),
      longitude: Number(longitude),
    }),
    [latitude, longitude]
  );

  const isInteractive = interactive || panEnabled || panZoomEnabled;
  const styleUrl = useMemo(() => getMaplibreStyleUrl(), []);

  const html = useMemo(
    () =>
      createMaplibreMapHtml({
        latitude: Number.isFinite(coordinate.latitude)
          ? coordinate.latitude
          : 11.0517,
        longitude: Number.isFinite(coordinate.longitude)
          ? coordinate.longitude
          : 124.0055,
        styleUrl,
        interactive: isInteractive,
      }),
    [
      isInteractive,
      styleUrl,
      // Preview maps remount when the captured GPS pin changes.
      isInteractive ? null : coordinate.latitude,
      isInteractive ? null : coordinate.longitude,
    ]
  );

  // --- [MAP VIEW] Sync marker to current coordinate ---
  const syncMarkerPosition = useCallback(() => {
    if (!webViewRef.current || !isMapReadyRef.current) {
      return;
    }

    const { latitude: lat, longitude: lng } = coordinate;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    webViewRef.current.injectJavaScript(
      `window.resetMarker(${lng}, ${lat}); true;`
    );
  }, [coordinate]);

  // --- [MAP VIEW] Imperative API: flyToLocation, resetMarker ---
  useImperativeHandle(ref, () => ({
    flyToLocation: (lng, lat) => {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);

      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
        return;
      }

      webViewRef.current?.injectJavaScript(
        `window.flyToLocation(${parsedLng}, ${parsedLat}); true;`
      );
    },
    resetMarker: (lng, lat) => {
      const parsedLat = Number(lat);
      const parsedLng = Number(lng);

      if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
        return;
      }

      webViewRef.current?.injectJavaScript(
        `window.resetMarker(${parsedLng}, ${parsedLat}); true;`
      );
    },
  }));

  useEffect(() => {
    syncMarkerPosition();
  }, [syncMarkerPosition]);

  // --- [MAP VIEW] WebView messages -> coordinate change ---
  const handleMessage = useCallback(
    (event) => {
      if (!onCoordinateChange) {
        return;
      }

      try {
        const payload = JSON.parse(event.nativeEvent.data);

        if (payload?.type === "location") {
          onCoordinateChange({
            latitude: payload.latitude,
            longitude: payload.longitude,
          });
        }
      } catch {
        // Ignore malformed WebView messages.
      }
    },
    [onCoordinateChange]
  );

  // --- [MAP VIEW] Render ---
  return (
    <View style={[styles.container, style]}>
      {/* [MAP VIEW UI] Map WebView */}
      <WebView
        ref={webViewRef}
        style={styles.map}
        source={{ html }}
        originWhitelist={["*"]}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        nestedScrollEnabled={isInteractive}
        onMessage={handleMessage}
        onLoadEnd={() => {
          isMapReadyRef.current = true;
          syncMarkerPosition();
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        setSupportMultipleWindows={false}
        pointerEvents={isInteractive ? "auto" : "none"}
      />

      {/* [MAP VIEW UI] Touch blocker for preview (non-interactive) maps */}
      {!isInteractive && <View style={styles.touchBlocker} pointerEvents="auto" />}
    </View>
  );
});

export default ComplaintMapView;

// ===== [MAP VIEW] Styles =====
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(232, 232, 232, 1)",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  touchBlocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import {
  createMaplibreMapHtml,
  getMaplibreStyleUrl,
} from "../lib/maplibreMapHtml";

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

  const initialCoordinateRef = useRef(coordinate);

  const html = useMemo(
    () =>
      createMaplibreMapHtml({
        latitude: initialCoordinateRef.current.latitude,
        longitude: initialCoordinateRef.current.longitude,
        styleUrl,
        interactive: isInteractive,
      }),
    [isInteractive, styleUrl]
  );

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

  return (
    <View style={[styles.container, style]}>
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

      {!isInteractive && <View style={styles.touchBlocker} pointerEvents="auto" />}
    </View>
  );
});

export default ComplaintMapView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#E8E8E8",
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  touchBlocker: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
});

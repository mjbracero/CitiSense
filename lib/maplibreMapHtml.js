export function getMaplibreStyleUrl() {
  const apiKey = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

  return apiKey
    ? `https://api.maptiler.com/maps/hybrid/style.json?key=${apiKey}`
    : "https://demotiles.maplibre.org/style.json";
}

export function createMaplibreMapHtml({
  latitude,
  longitude,
  styleUrl,
  interactive = false,
}) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return `
      <!DOCTYPE html>
      <html>
        <body style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#f7faf6;color:#6f776f;font-family:Arial;">
          Map unavailable
        </body>
      </html>
    `;
  }

  const clickHandler = interactive
    ? `
          map.on("click", (event) => {
            const { lng: nextLng, lat: nextLat } = event.lngLat;
            updateMarker(nextLng, nextLat);
            postLocation(nextLat, nextLng);
          });
        `
    : "";

  const interactivitySetup = interactive
    ? ""
    : `
          map.dragPan.disable();
          map.scrollZoom.disable();
          map.boxZoom.disable();
          map.doubleClickZoom.disable();
          map.touchZoomRotate.disable();
          map.dragRotate.disable();
          map.touchPitch.disable();
          map.keyboard.disable();
          map.touchZoomRotate.disableRotation();
          document.getElementById("map").classList.add("read-only");
        `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
        <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
        <style>
          html, body, #map {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #f7faf6;
            overflow: hidden;
            touch-action: none;
          }

          .complaint-marker {
            width: 28px;
            height: 40px;
            display: block;
            background: transparent;
            pointer-events: auto;
          }

          .complaint-marker svg {
            display: block;
            width: 28px;
            height: 40px;
            overflow: visible;
          }

          #map.read-only,
          #map.read-only .maplibregl-canvas {
            pointer-events: none !important;
            touch-action: none !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          let marker = null;

          const map = new maplibregl.Map({
            container: "map",
            style: ${JSON.stringify(styleUrl)},
            center: [${lng}, ${lat}],
            zoom: 16,
            interactive: ${interactive},
            attributionControl: ${interactive ? "true" : "false"},
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
          });

          window.map = map;

          /**
           * SVG pin with its tip at the bottom-center of the viewBox (14, 40).
           * MapLibre anchors the marker at that tip so coordinates stay fixed on zoom.
           */
          function createComplaintMarkerElement() {
            const element = document.createElement("div");
            element.className = "complaint-marker";
            element.innerHTML =
              '<svg viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
              '<path d="M14 1.5C7.65 1.5 2.5 6.65 2.5 13c0 8.75 11.5 25.5 11.5 25.5S25.5 21.75 25.5 13C25.5 6.65 20.35 1.5 14 1.5z" fill="#d71920" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>' +
              '<circle cx="14" cy="13" r="4.2" fill="#ffffff"/>' +
              "</svg>";
            return element;
          }

          function updateMarker(lng, lat) {
            if (!marker) {
              marker = new maplibregl.Marker({
                element: createComplaintMarkerElement(),
                anchor: "bottom",
                pitchAlignment: "map",
                rotationAlignment: "map",
              })
                .setLngLat([lng, lat])
                .addTo(map);
            } else {
              marker.setLngLat([lng, lat]);
            }
          }

          function postLocation(lat, lng) {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(
                JSON.stringify({ type: "location", latitude: lat, longitude: lng })
              );
            }
          }

          map.on("load", () => {
            updateMarker(${lng}, ${lat});
            ${interactivitySetup}
            setTimeout(() => map.resize(), 250);
            setTimeout(() => map.resize(), 800);
          });

          ${clickHandler}

          window.flyToLocation = function(lng, lat) {
            const parsedLng = Number(lng);
            const parsedLat = Number(lat);
            if (!Number.isFinite(parsedLng) || !Number.isFinite(parsedLat)) return;
            map.flyTo({ center: [parsedLng, parsedLat], zoom: 16, duration: 500 });
            updateMarker(parsedLng, parsedLat);
            postLocation(parsedLat, parsedLng);
          };

          window.resetMarker = function(lng, lat) {
            const parsedLng = Number(lng);
            const parsedLat = Number(lat);
            if (!Number.isFinite(parsedLng) || !Number.isFinite(parsedLat)) return;
            updateMarker(parsedLng, parsedLat);
            if (${interactive}) {
              map.flyTo({ center: [parsedLng, parsedLat], zoom: 16, duration: 400 });
            } else {
              map.jumpTo({ center: [parsedLng, parsedLat], zoom: 16 });
            }
          };
        </script>
      </body>
    </html>
  `;
}

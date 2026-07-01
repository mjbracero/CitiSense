const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

function getOpenStreetMapFallbackUrl(latitude, longitude, width, height) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  const mapWidth = Math.min(Math.max(Math.round(width), 200), 1024);
  const mapHeight = Math.min(Math.max(Math.round(height), 120), 1024);

  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=${mapWidth}x${mapHeight}&maptype=mapnik&markers=${lat},${lng},red-pushpin`;
}

export function getStaticMapUrl(
  latitude,
  longitude,
  width = 640,
  height = 280
) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (MAPTILER_API_KEY) {
    return `https://api.maptiler.com/maps/streets-v2/static/pin-s+D71920(${lng},${lat})/${lng},${lat},16/${width}x${height}@2x.png?key=${MAPTILER_API_KEY}`;
  }

  return getOpenStreetMapFallbackUrl(lat, lng, width, height);
}

import * as Location from "expo-location";

const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY;

export function buildAddress(place) {
  if (!place) return "";

  if (
    typeof place.formattedAddress === "string" &&
    place.formattedAddress.trim()
  ) {
    return place.formattedAddress.trim();
  }

  const streetLine = [place.streetNumber, place.street]
    .filter(Boolean)
    .join(" ")
    .trim();

  const parts = [
    streetLine || null,
    place.name,
    place.district,
    place.subregion,
    place.city,
    place.region,
    place.postalCode,
    place.country,
  ].filter(Boolean);

  const seen = new Set();
  const unique = [];

  for (const part of parts) {
    const key = part.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }

  return unique.join(", ");
}

function countAddressParts(address) {
  return address.split(",").map((part) => part.trim()).filter(Boolean).length;
}

async function fetchMapTilerAddress(latitude, longitude) {
  if (!MAPTILER_API_KEY) return "";

  try {
    const lng = Number(longitude);
    const lat = Number(latitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return "";
    }

    const url = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${MAPTILER_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      return "";
    }

    const data = await response.json();
    const feature = data?.features?.[0];

    return feature?.place_name?.trim() || "";
  } catch {
    return "";
  }
}

export function simplifyToCommonAddress(address) {
  if (!address) return "";

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const filtered = parts.filter((part) => {
    const lower = part.toLowerCase();
    return (
      lower !== "philippines" &&
      lower !== "central visayas" &&
      lower !== "republic of the philippines"
    );
  });

  if (filtered.length === 0) {
    return address.trim();
  }

  return filtered.slice(0, 4).join(", ");
}

export async function resolveCommonAddress(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }

  let expoAddress = "";

  try {
    const result = await Location.reverseGeocodeAsync({
      latitude: lat,
      longitude: lng,
    });

    expoAddress = buildAddress(result?.[0]);
  } catch {
    expoAddress = "";
  }

  const mapTilerAddress = await fetchMapTilerAddress(lat, lng);
  const expoDetail = countAddressParts(expoAddress);
  const mapTilerDetail = countAddressParts(mapTilerAddress);

  let resolvedAddress = "";

  if (mapTilerAddress && mapTilerDetail >= expoDetail) {
    resolvedAddress = mapTilerAddress;
  } else if (expoAddress) {
    resolvedAddress = expoAddress;
  } else if (mapTilerAddress) {
    resolvedAddress = mapTilerAddress;
  } else {
    return `Lat ${lat.toFixed(5)}, Long ${lng.toFixed(5)}`;
  }

  return simplifyToCommonAddress(resolvedAddress);
}

/** @deprecated Use resolveCommonAddress */
export const resolveExactAddress = resolveCommonAddress;

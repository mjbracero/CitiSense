export const BOGO_CITY_BOUNDS = {
  minLatitude: 10.97,
  maxLatitude: 11.12,
  minLongitude: 123.96,
  maxLongitude: 124.08,
};

export function isInsideBogoCity(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  return (
    lat >= BOGO_CITY_BOUNDS.minLatitude &&
    lat <= BOGO_CITY_BOUNDS.maxLatitude &&
    lng >= BOGO_CITY_BOUNDS.minLongitude &&
    lng <= BOGO_CITY_BOUNDS.maxLongitude
  );
}

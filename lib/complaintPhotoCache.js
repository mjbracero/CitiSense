import { supabase } from "./supabase";

const COMPLAINT_PHOTOS_BUCKET = "complaint-photos";
const STORAGE_BUCKET_PREFIXES = [
  "validation-photos",
  "complaint-validation-photos",
  COMPLAINT_PHOTOS_BUCKET,
];

/** @type {Map<string, string|null>} */
const resolvedUrlCache = new Map();
/** @type {Map<string, Promise<string|null>>} */
const resolveInFlight = new Map();
/** @type {Map<string, string[]>} */
const complaintPhotoListCache = new Map();

function normalizePhotoUrls(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      // Fall through to single URL / comma list.
    }

    if (text.includes(",")) {
      return text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    }

    return [text];
  }

  return [];
}

function extractComplaintPhotoPath(value) {
  if (!value) return null;

  const text = decodeURIComponent(String(value));
  const publicMarker = `/storage/v1/object/public/${COMPLAINT_PHOTOS_BUCKET}/`;
  const signMarker = `/storage/v1/object/sign/${COMPLAINT_PHOTOS_BUCKET}/`;

  if (text.includes(publicMarker)) {
    return text.split(publicMarker)[1]?.split("?")[0] || null;
  }

  if (text.includes(signMarker)) {
    return text.split(signMarker)[1]?.split("?")[0] || null;
  }

  for (const bucketName of STORAGE_BUCKET_PREFIXES) {
    const bucketPublic = `/storage/v1/object/public/${bucketName}/`;
    const bucketSign = `/storage/v1/object/sign/${bucketName}/`;

    if (text.includes(bucketPublic)) {
      return text.split(bucketPublic)[1]?.split("?")[0] || null;
    }

    if (text.includes(bucketSign)) {
      return text.split(bucketSign)[1]?.split("?")[0] || null;
    }
  }

  if (!/^https?:\/\//i.test(text)) {
    let cleaned = text.replace(/^\/+/, "");

    for (const bucketName of STORAGE_BUCKET_PREFIXES) {
      if (cleaned.startsWith(`${bucketName}/`)) {
        cleaned = cleaned.slice(bucketName.length + 1);
      }
    }

    return cleaned;
  }

  return null;
}

/**
 * Resolve a single complaint photo to a readable URL once per session.
 */
export async function resolveReadableComplaintPhotoUrl(value) {
  if (!value) return null;

  const rawValue = String(value);

  if (resolvedUrlCache.has(rawValue)) {
    return resolvedUrlCache.get(rawValue);
  }

  if (resolveInFlight.has(rawValue)) {
    return resolveInFlight.get(rawValue);
  }

  const promise = (async () => {
    try {
      const path = extractComplaintPhotoPath(rawValue);

      if (path) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from(COMPLAINT_PHOTOS_BUCKET)
          .createSignedUrl(path, 60 * 60 * 24);

        if (!signedError && signedData?.signedUrl) {
          resolvedUrlCache.set(rawValue, signedData.signedUrl);
          return signedData.signedUrl;
        }

        const { data: publicData } = supabase.storage
          .from(COMPLAINT_PHOTOS_BUCKET)
          .getPublicUrl(path);

        if (publicData?.publicUrl) {
          resolvedUrlCache.set(rawValue, publicData.publicUrl);
          return publicData.publicUrl;
        }
      }

      if (/^https?:\/\//i.test(rawValue)) {
        resolvedUrlCache.set(rawValue, rawValue);
        return rawValue;
      }

      resolvedUrlCache.set(rawValue, null);
      return null;
    } catch (error) {
      console.log("Resolve complaint photo error:", error);
      return null;
    } finally {
      resolveInFlight.delete(rawValue);
    }
  })();

  resolveInFlight.set(rawValue, promise);
  return promise;
}

async function resolveUrlList(rawUrls = []) {
  const resolvedUrls = [];

  for (const rawUrl of rawUrls) {
    const resolvedUrl = await resolveReadableComplaintPhotoUrl(rawUrl);
    if (resolvedUrl) {
      resolvedUrls.push(resolvedUrl);
    }
  }

  return resolvedUrls;
}

async function listComplaintFolderUrls(complaintId, { validationOnly = false } = {}) {
  if (!complaintId) return [];

  const cacheKey = `${complaintId}:${validationOnly ? "validation" : "evidence"}`;
  if (complaintPhotoListCache.has(cacheKey)) {
    return complaintPhotoListCache.get(cacheKey);
  }

  try {
    const { data: files, error } = await supabase.storage
      .from(COMPLAINT_PHOTOS_BUCKET)
      .list(String(complaintId), {
        limit: 20,
        sortBy: { column: "name", order: "asc" },
      });

    if (error || !files?.length) {
      complaintPhotoListCache.set(cacheKey, []);
      return [];
    }

    const imageFiles = files.filter((file) => {
      const name = String(file.name || "").toLowerCase();
      const isValidation = name.startsWith("validation-");

      if (validationOnly ? !isValidation : isValidation) {
        return false;
      }

      return (
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".png") ||
        name.endsWith(".heic") ||
        name.endsWith(".heif")
      );
    });

    const listedUrls = [];

    for (const file of imageFiles) {
      const storagePath = `${complaintId}/${file.name}`;
      const resolvedUrl = await resolveReadableComplaintPhotoUrl(storagePath);
      if (resolvedUrl) {
        listedUrls.push(resolvedUrl);
      }
    }

    complaintPhotoListCache.set(cacheKey, listedUrls);
    return listedUrls;
  } catch (error) {
    console.log("List complaint photos error:", error);
    return [];
  }
}

/**
 * Evidence photos for a complaint. Cached by complaint id / raw URL for the session.
 */
export async function resolveComplaintEvidencePhotoUrls(row) {
  if (!row) return [];

  const complaintId = row.id || row.rawId || null;
  const cacheKey = complaintId ? `evidence:${complaintId}` : null;

  if (cacheKey && complaintPhotoListCache.has(cacheKey)) {
    return complaintPhotoListCache.get(cacheKey);
  }

  const rawUrls = normalizePhotoUrls(
    row.photo_urls ||
      row.photos ||
      row.uploaded_photos ||
      row.uploadedPhotos ||
      row.image_urls
  );

  let resolved = await resolveUrlList(rawUrls);

  if (resolved.length === 0 && complaintId) {
    resolved = await listComplaintFolderUrls(complaintId, {
      validationOnly: false,
    });
  }

  if (cacheKey) {
    complaintPhotoListCache.set(cacheKey, resolved);
  }

  return resolved;
}

/**
 * Citizen validation photos for a complaint. Cached for the session.
 */
export async function resolveComplaintValidationPhotoUrls(row) {
  if (!row) return [];

  const complaintId = row.id || row.rawId || null;
  const cacheKey = complaintId ? `validation:${complaintId}` : null;

  if (cacheKey && complaintPhotoListCache.has(cacheKey)) {
    return complaintPhotoListCache.get(cacheKey);
  }

  const rawUrls = normalizePhotoUrls(
    row.citizen_validation_photo_urls ||
      row.citizen_feedback_photo_urls ||
      row.validation_photo_urls ||
      row.validation_photos ||
      row.validationPhotos ||
      row.validation_photo ||
      row.validationPhoto
  );

  let resolved = await resolveUrlList(rawUrls);

  if (resolved.length === 0 && complaintId) {
    resolved = await listComplaintFolderUrls(complaintId, {
      validationOnly: true,
    });
  }

  if (cacheKey) {
    complaintPhotoListCache.set(cacheKey, resolved);
  }

  return resolved;
}

export function clearComplaintPhotoCache() {
  resolvedUrlCache.clear();
  resolveInFlight.clear();
  complaintPhotoListCache.clear();
}

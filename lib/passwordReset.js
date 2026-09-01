import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

export const PASSWORD_RESET_REDIRECT_TO = "citisense://auth/resetPassword";

const RECOVERY_FLAG_KEY = "citisense_password_recovery_active";

let passwordRecoveryActive = false;
let lastHandledAuthUrl = null;
const inflightAuthByUrl = new Map();

export function getPasswordResetRedirectTo() {
  // Always use the native app scheme. Linking.createURL() returns Expo Go /
  // dev-client URLs that break email redirects and Supabase allowlists.
  return PASSWORD_RESET_REDIRECT_TO;
}

export async function markPasswordRecoveryActive(value = true) {
  passwordRecoveryActive = Boolean(value);
  try {
    if (passwordRecoveryActive) {
      await AsyncStorage.setItem(RECOVERY_FLAG_KEY, "1");
    } else {
      await AsyncStorage.removeItem(RECOVERY_FLAG_KEY);
    }
  } catch {
    // Ignore storage errors; in-memory flag still works for this session.
  }
}

export function isPasswordRecoveryActive() {
  return passwordRecoveryActive;
}

export async function hydratePasswordRecoveryFlag() {
  try {
    const stored = await AsyncStorage.getItem(RECOVERY_FLAG_KEY);
    passwordRecoveryActive = stored === "1";
  } catch {
    passwordRecoveryActive = false;
  }
  return passwordRecoveryActive;
}

export function extractAuthParamsFromUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) {
    return {};
  }

  const [withoutHash, hash = ""] = raw.split("#");
  const queryIndex = withoutHash.indexOf("?");
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";

  const queryParams = new URLSearchParams(query);
  const hashParams = new URLSearchParams(hash);

  const get = (key) => queryParams.get(key) || hashParams.get(key) || null;

  return {
    code: get("code"),
    access_token: get("access_token"),
    refresh_token: get("refresh_token"),
    type: get("type"),
    token_hash: get("token_hash") || get("token"),
    error: get("error"),
    error_description: get("error_description"),
  };
}

function urlLooksLikePasswordResetPath(url = "") {
  const raw = String(url || "").toLowerCase();
  return (
    raw.includes("resetpassword") ||
    raw.includes("reset-password") ||
    raw.includes("auth/reset")
  );
}

/**
 * True only for forgot-password / recovery links — NOT signup email confirm.
 * Signup uses citisense://auth/login which must not open reset password.
 */
export function isPasswordResetCallbackUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return false;

  const params = extractAuthParamsFromUrl(raw);
  const type = String(params.type || "").toLowerCase();

  if (type === "recovery") {
    return true;
  }

  // Explicit non-recovery auth emails (signup confirm, magic link, etc.)
  if (
    type === "signup" ||
    type === "email" ||
    type === "magiclink" ||
    type === "invite" ||
    type === "email_change"
  ) {
    return false;
  }

  return urlLooksLikePasswordResetPath(raw);
}

/** Any deep link that carries an auth code/tokens (signup confirm or reset). */
export function isAuthCallbackUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return false;

  if (!raw.toLowerCase().includes("citisense://")) {
    return false;
  }

  const params = extractAuthParamsFromUrl(raw);
  return Boolean(
    params.code ||
      params.token_hash ||
      (params.access_token && params.refresh_token) ||
      params.error
  );
}

function shouldTreatAsPasswordRecovery(url, params) {
  const type = String(params?.type || "").toLowerCase();

  if (type === "recovery") {
    return true;
  }

  if (
    type === "signup" ||
    type === "email" ||
    type === "magiclink" ||
    type === "invite" ||
    type === "email_change"
  ) {
    return false;
  }

  return urlLooksLikePasswordResetPath(url);
}

async function exchangeAuthParams(url, params) {
  if (params.error) {
    throw new Error(
      params.error_description || params.error || "Invalid auth link."
    );
  }

  const recovery = shouldTreatAsPasswordRecovery(url, params);

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      params.code
    );

    if (error) {
      const { data: existing } = await supabase.auth.getSession();
      if (existing?.session) {
        await markPasswordRecoveryActive(recovery);
        return {
          session: existing.session,
          recovery,
        };
      }
      throw error;
    }

    await markPasswordRecoveryActive(recovery);
    return {
      session: data?.session || null,
      recovery,
    };
  }

  if (params.token_hash) {
    const type = String(params.type || (recovery ? "recovery" : "signup"));
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: params.token_hash,
      type,
    });

    if (error) {
      throw error;
    }

    await markPasswordRecoveryActive(recovery);
    return {
      session: data?.session || null,
      recovery,
    };
  }

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });

    if (error) {
      throw error;
    }

    await markPasswordRecoveryActive(recovery);
    return {
      session: data?.session || null,
      recovery,
    };
  }

  const { data } = await supabase.auth.getSession();
  if (recovery && data?.session) {
    await markPasswordRecoveryActive(true);
  }

  return {
    session: data?.session || null,
    recovery: recovery && Boolean(data?.session),
  };
}

/**
 * Exchange email deep-link tokens/code for a Supabase session.
 * Safe to call from splash + root layout (auth codes are single-use).
 */
export async function establishSessionFromAuthUrl(url) {
  const normalized = String(url || "").trim();
  if (!normalized) {
    const { data } = await supabase.auth.getSession();
    return {
      session: data?.session || null,
      recovery: passwordRecoveryActive,
    };
  }

  if (lastHandledAuthUrl === normalized) {
    const { data } = await supabase.auth.getSession();
    return {
      session: data?.session || null,
      recovery: passwordRecoveryActive,
    };
  }

  if (inflightAuthByUrl.has(normalized)) {
    return inflightAuthByUrl.get(normalized);
  }

  const params = extractAuthParamsFromUrl(normalized);

  const promise = exchangeAuthParams(normalized, params)
    .then((result) => {
      lastHandledAuthUrl = normalized;
      return result;
    })
    .finally(() => {
      inflightAuthByUrl.delete(normalized);
    });

  inflightAuthByUrl.set(normalized, promise);
  return promise;
}

export async function establishSessionFromAuthParams(params = {}) {
  const cleaned = {
    code: params.code || null,
    access_token: params.access_token || null,
    refresh_token: params.refresh_token || null,
    type: params.type || null,
    token_hash: params.token_hash || params.token || null,
    error: params.error || null,
    error_description: params.error_description || null,
  };

  const hasAuthPayload = Boolean(
    cleaned.code ||
      cleaned.token_hash ||
      (cleaned.access_token && cleaned.refresh_token)
  );

  if (!hasAuthPayload) {
    return {
      session: null,
      recovery: false,
    };
  }

  const recovery = shouldTreatAsPasswordRecovery("", cleaned);
  const path = recovery ? "resetPassword" : "login";
  const syntheticUrl = `citisense://auth/${path}?${new URLSearchParams(
    Object.fromEntries(
      Object.entries(cleaned).filter(([, value]) => value != null)
    )
  ).toString()}`;

  return establishSessionFromAuthUrl(syntheticUrl);
}

export async function consumeInitialPasswordResetUrl() {
  const initialUrl = await Linking.getInitialURL();

  if (!initialUrl || !isPasswordResetCallbackUrl(initialUrl)) {
    return null;
  }

  const result = await establishSessionFromAuthUrl(initialUrl);
  return {
    url: initialUrl,
    ...result,
  };
}

/** Handle signup / email-confirm deep links (not password recovery). */
export async function completeEmailConfirmationFromUrl(url) {
  if (!url || !isAuthCallbackUrl(url) || isPasswordResetCallbackUrl(url)) {
    return { confirmed: false };
  }

  try {
    await establishSessionFromAuthUrl(url);
    await markPasswordRecoveryActive(false);
    // Confirm email via the link, then require a normal login with password.
    await supabase.auth.signOut();
    return { confirmed: true };
  } catch (error) {
    console.log("Email confirmation error:", error);
    await markPasswordRecoveryActive(false);
    return { confirmed: false, error };
  }
}

export async function consumeInitialEmailConfirmUrl() {
  const initialUrl = await Linking.getInitialURL();

  if (!initialUrl || !isAuthCallbackUrl(initialUrl)) {
    return null;
  }

  if (isPasswordResetCallbackUrl(initialUrl)) {
    return null;
  }

  const result = await completeEmailConfirmationFromUrl(initialUrl);
  return result.confirmed ? { url: initialUrl, confirmed: true } : null;
}

export async function waitForRecoverySession({
  attempts = 8,
  delayMs = 250,
} = {}) {
  await hydratePasswordRecoveryFlag();

  for (let i = 0; i < attempts; i += 1) {
    const { data } = await supabase.auth.getSession();
    if (data?.session && passwordRecoveryActive) {
      return data.session;
    }
    if (data?.session && i >= attempts - 1 && passwordRecoveryActive) {
      return data.session;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
}

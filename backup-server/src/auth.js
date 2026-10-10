// ===== [BACKUP SERVER] Auth: only signed-in CitiSense admins may use the API =====
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabaseAdmin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function getSupabaseAdmin() {
  return supabaseAdmin;
}

function isEmergencyKey(token) {
  const key = config.emergencyAccessKey;
  if (key.length < 32 || token.length !== key.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(key));
}

export async function requireAdmin(req, res, next) {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({ error: "Missing access token." });
    }

    if (isEmergencyKey(token)) {
      console.warn(`Emergency access used: ${req.method} ${req.path}`);
      req.adminUser = { id: null, email: "emergency-access" };
      return next();
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role, banned_at")
      .eq("id", userData.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin" || profile?.banned_at) {
      return res.status(403).json({ error: "Only CitiSense administrators can manage backups." });
    }

    req.adminUser = { id: userData.user.id, email: userData.user.email };
    return next();
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "Unable to verify administrator." });
  }
}

// --- Short-lived signed download links (so the browser/phone can open them directly) ---
function sign(value) {
  return crypto.createHmac("sha256", config.downloadSecret).update(value).digest("hex");
}

export function createDownloadToken(backupId) {
  const expiresAt = Date.now() + config.downloadLinkMinutes * 60 * 1000;
  return `${expiresAt}.${sign(`${backupId}.${expiresAt}`)}`;
}

export function verifyDownloadToken(backupId, token) {
  const [expiresAtText, signature] = String(token || "").split(".");
  const expiresAt = Number(expiresAtText);

  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const expected = sign(`${backupId}.${expiresAt}`);
  return (
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  );
}

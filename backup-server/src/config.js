// ===== [BACKUP SERVER] Configuration (all secrets come from environment variables) =====
import path from "node:path";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function number(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: number("PORT", 8080),
  publicUrl: String(process.env.PUBLIC_URL || "").replace(/\/+$/, ""),

  // Source system (read-only use)
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: required("SUPABASE_DB_URL"),
  buckets: String(process.env.BACKUP_BUCKETS || "complaint-photos,avatars,validation-photos")
    .split(",")
    .map((bucket) => bucket.trim())
    .filter(Boolean),

  // Where backups are kept (mount a persistent disk here on the host)
  backupDir: path.resolve(process.env.BACKUP_DIR || "./data/backups"),
  retentionDays: number("BACKUP_RETENTION_DAYS", 14),
  minKeep: number("BACKUP_MIN_KEEP", 3),

  // Schedule: nightly at 2:00 AM Philippine time -> RPO 24 hours
  cron: String(process.env.BACKUP_CRON || "0 2 * * *"),
  timezone: String(process.env.BACKUP_TIMEZONE || "Asia/Manila"),
  rpoHours: number("BACKUP_RPO_HOURS", 24),

  // Signs short-lived download links
  // Only the HTTP server needs this (checked in server.js); CLI/GitHub Actions runs don't.
  downloadSecret: String(process.env.DOWNLOAD_SIGNING_SECRET || "").trim(),
  downloadLinkMinutes: number("DOWNLOAD_LINK_MINUTES", 10),

  // Break-glass key: lets the recovery team use the API while Supabase login is down.
  // Leave empty to disable. Must be long (32+ characters).
  emergencyAccessKey: String(process.env.EMERGENCY_ACCESS_KEY || "").trim(),

  // Web origins allowed to call the API (native apps don't need CORS)
  allowedOrigins: String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

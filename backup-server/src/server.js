// ===== [BACKUP SERVER] HTTP API + nightly schedule =====
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import cors from "cors";
import express from "express";
import cron from "node-cron";
import { config } from "./config.js";
import { createDownloadToken, requireAdmin, verifyDownloadToken } from "./auth.js";
import {
  archivePath,
  getBackupStatus,
  getRunningBackup,
  isValidBackupId,
  listBackups,
  runBackup,
} from "./backup.js";

if (!config.downloadSecret) {
  throw new Error("Missing required environment variable: DOWNLOAD_SIGNING_SECRET");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || config.allowedOrigins.includes(origin)),
  })
);

async function checkSupabase() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: config.supabaseServiceRoleKey },
      signal: controller.signal,
    });
    return response.ok ? "up" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

// Public: one URL for an uptime monitor. Returns 503 when Supabase is down
// or the last good backup is older than the RPO, so the monitor sends an alert.
app.get("/health", async (_req, res) => {
  const [status, supabase] = await Promise.all([getBackupStatus(), checkSupabase()]);
  const ok = supabase === "up" && (status.withinRpo || Boolean(status.running));
  res.status(ok ? 200 : 503).json({
    ok,
    supabase,
    withinRpo: status.withinRpo,
    hoursSinceLastSuccess: status.hoursSinceLastSuccess,
    rpoHours: status.rpoHours,
    running: Boolean(status.running),
  });
});

app.get("/status", requireAdmin, async (_req, res) => {
  res.json(await getBackupStatus());
});

app.get("/backups", requireAdmin, async (_req, res) => {
  res.json({ backups: await listBackups() });
});

// Starts a backup in the background; the app polls /status for the result.
app.post("/backup", requireAdmin, (req, res) => {
  const current = getRunningBackup();
  if (current) {
    return res.status(409).json({ error: "A backup is already running.", id: current.id });
  }

  runBackup({ trigger: "manual", requestedBy: req.adminUser.email }).catch((error) =>
    console.error("Manual backup error:", error)
  );
  return res.status(202).json({ started: true });
});

app.post("/backups/:id/link", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!isValidBackupId(id)) return res.status(400).json({ error: "Invalid backup id." });

  try {
    await fs.access(archivePath(id));
  } catch {
    return res.status(404).json({ error: "Backup file not found." });
  }

  const token = createDownloadToken(id);
  const base = config.publicUrl || `${req.protocol}://${req.get("host")}`;
  res.json({
    url: `${base}/backups/${id}/download?token=${encodeURIComponent(token)}`,
    expiresInMinutes: config.downloadLinkMinutes,
  });
});

app.get("/backups/:id/download", async (req, res) => {
  const { id } = req.params;
  if (!isValidBackupId(id) || !verifyDownloadToken(id, req.query.token)) {
    return res.status(403).json({ error: "Download link is invalid or expired." });
  }

  const file = archivePath(id);
  try {
    const stats = await fs.stat(file);
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Disposition", `attachment; filename="${id}.tar.gz"`);
    createReadStream(file).pipe(res);
  } catch {
    res.status(404).json({ error: "Backup file not found." });
  }
});

cron.schedule(
  config.cron,
  () => {
    runBackup({ trigger: "scheduled" }).catch((error) =>
      console.error("Scheduled backup error:", error)
    );
  },
  { timezone: config.timezone }
);

app.listen(config.port, () => {
  console.log(
    `CitiSense backup API on :${config.port} • schedule "${config.cron}" (${config.timezone}) • dir ${config.backupDir}`
  );
});

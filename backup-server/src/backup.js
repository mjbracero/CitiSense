// ===== [BACKUP SERVER] Backup job: database dump + storage files -> local archive =====
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { getSupabaseAdmin } from "./auth.js";
import { writeCsvExports } from "./exports.js";

const BACKUP_ID = /^citisense-\d{8}-\d{6}$/;

const README_TEXT = `CITISENSE BACKUP - READ ME FIRST

excel/                 Open these in Excel, Numbers or Google Sheets.
  complaints.csv         All complaints (one row each) with status, offices, citizen, location, dates.
  department_status.csv  Each department's own status for every complaint.
  users.csv              All accounts (no passwords).
storage/               Photos. "Photo Files" in complaints.csv points to storage/complaint-photos/<file>.
db-public.dump         Full database, used only to RESTORE the system (see backup-server/README.md).
db-auth-users.sql      Login accounts, used only to RESTORE the system.
manifest.json          When this backup was made and what it contains.

CONFIDENTIAL: contains citizens' personal data (Data Privacy Act of 2012).
Keep it on password-protected devices only. Do not share or upload publicly.
`;
let running = null;

function timestampId(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `citisense-${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

export function isValidBackupId(id) {
  return BACKUP_ID.test(String(id || ""));
}

export function archivePath(id) {
  return path.join(config.backupDir, `${id}.tar.gz`);
}

function manifestPath(id) {
  return path.join(config.backupDir, `${id}.json`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim().slice(-800)}`));
    });
  });
}

// --- Database: full public schema (structure + data) and auth users (data) ---
async function dumpDatabase(workDir) {
  await run("pg_dump", [
    config.databaseUrl,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    `--file=${path.join(workDir, "db-public.dump")}`,
  ]);

  await run("pg_dump", [
    config.databaseUrl,
    "--data-only",
    "--inserts",
    "--no-owner",
    "--no-privileges",
    "--table=auth.users",
    "--table=auth.identities",
    `--file=${path.join(workDir, "db-auth-users.sql")}`,
  ]);
}

// --- Storage: download every file in each bucket, keeping the same paths ---
async function listBucketFiles(storage, bucket, prefix = "") {
  const files = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`List ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        files.push(...(await listBucketFiles(storage, bucket, itemPath)));
      } else {
        files.push(itemPath);
      }
    }

    if (data.length < pageSize) break;
  }

  return files;
}

async function downloadBuckets(workDir) {
  const storage = getSupabaseAdmin().storage;
  const summary = {};

  for (const bucket of config.buckets) {
    const files = await listBucketFiles(storage, bucket);
    let bytes = 0;
    let failed = 0;

    for (const filePath of files) {
      const { data, error } = await storage.from(bucket).download(filePath);
      if (error || !data) {
        failed += 1;
        console.error(`Download failed ${bucket}/${filePath}:`, error?.message);
        continue;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      const target = path.join(workDir, "storage", bucket, filePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, buffer);
      bytes += buffer.length;
    }

    summary[bucket] = { files: files.length - failed, failed, bytes };
  }

  return summary;
}

// --- Retention: delete old backups but always keep the newest few ---
async function cleanupOldBackups() {
  const backups = await listBackups();
  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  const successful = backups.filter((item) => item.status === "success");
  const keep = new Set(successful.slice(0, config.minKeep).map((item) => item.id));

  for (const item of backups) {
    if (keep.has(item.id)) continue;
    if (new Date(item.startedAt).getTime() >= cutoff) continue;
    await fs.rm(archivePath(item.id), { force: true });
    await fs.rm(manifestPath(item.id), { force: true });
  }
}

export function getRunningBackup() {
  return running;
}

export async function runBackup({ trigger = "manual", requestedBy = null } = {}) {
  if (running) {
    return { alreadyRunning: true, id: running.id };
  }

  await fs.mkdir(config.backupDir, { recursive: true });

  const id = timestampId();
  const startedAt = new Date();
  const workDir = path.join(config.backupDir, `${id}.work`);
  const manifest = {
    id,
    trigger,
    requestedBy,
    status: "running",
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    durationMs: null,
    sizeBytes: null,
    database: null,
    storage: null,
    error: null,
  };

  running = manifest;
  await fs.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2));

  try {
    await fs.mkdir(workDir, { recursive: true });

    await dumpDatabase(workDir);
    manifest.database = { files: ["db-public.dump", "db-auth-users.sql"] };

    manifest.excel = await writeCsvExports(workDir);
    await fs.writeFile(path.join(workDir, "READ ME FIRST.txt"), README_TEXT);

    manifest.storage = await downloadBuckets(workDir);

    await fs.writeFile(
      path.join(workDir, "manifest.json"),
      JSON.stringify({ ...manifest, status: "success" }, null, 2)
    );
    await run("tar", ["-czf", archivePath(id), "-C", workDir, "."]);

    const stats = await fs.stat(archivePath(id));
    manifest.sizeBytes = stats.size;
    manifest.status = "success";
  } catch (error) {
    manifest.status = "failed";
    manifest.error = String(error?.message || error).slice(0, 1000);
    await fs.rm(archivePath(id), { force: true });
    console.error(`Backup ${id} failed:`, error);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
    manifest.finishedAt = new Date().toISOString();
    manifest.durationMs = Date.now() - startedAt.getTime();
    await fs.writeFile(manifestPath(id), JSON.stringify(manifest, null, 2));
    running = null;
  }

  if (manifest.status === "success") {
    await cleanupOldBackups().catch((error) => console.error("Cleanup error:", error));
  }

  return manifest;
}

export async function listBackups() {
  await fs.mkdir(config.backupDir, { recursive: true });
  const entries = await fs.readdir(config.backupDir);
  const manifests = [];

  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -5);
    if (!isValidBackupId(id)) continue;

    try {
      manifests.push(JSON.parse(await fs.readFile(manifestPath(id), "utf8")));
    } catch {
      // Ignore unreadable manifests.
    }
  }

  return manifests.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export async function getBackupStatus() {
  const backups = await listBackups();
  const lastSuccess = backups.find((item) => item.status === "success") || null;
  const hoursSinceLastSuccess = lastSuccess
    ? (Date.now() - new Date(lastSuccess.finishedAt || lastSuccess.startedAt).getTime()) / 3600000
    : null;

  return {
    running: running ? { id: running.id, startedAt: running.startedAt } : null,
    lastSuccess,
    hoursSinceLastSuccess: hoursSinceLastSuccess == null ? null : Number(hoursSinceLastSuccess.toFixed(1)),
    rpoHours: config.rpoHours,
    withinRpo: hoursSinceLastSuccess != null && hoursSinceLastSuccess <= config.rpoHours,
    schedule: { cron: config.cron, timezone: config.timezone },
    retentionDays: config.retentionDays,
  };
}

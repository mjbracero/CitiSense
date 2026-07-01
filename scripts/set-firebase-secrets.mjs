#!/usr/bin/env node
/**
 * Load Firebase service account JSON and set Supabase edge-function secrets.
 *
 * Usage:
 *   node scripts/set-firebase-secrets.mjs /path/to/service-account.json
 *
 * Default path (if omitted):
 *   ~/Downloads/citisense-e8c47-firebase-adminsdk-fbsvc-e3d7a0c79b.json
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const defaultPath = join(
  homedir(),
  "Downloads",
  "citisense-e8c47-firebase-adminsdk-fbsvc-e3d7a0c79b.json"
);

const jsonPath = process.argv[2] || defaultPath;
const creds = JSON.parse(readFileSync(jsonPath, "utf8"));

if (!creds.project_id || !creds.client_email || !creds.private_key) {
  console.error("Invalid Firebase service account JSON:", jsonPath);
  process.exit(1);
}

console.log("Setting Firebase secrets for project:", creds.project_id);
console.log("Service account:", creds.client_email);

const result = spawnSync(
  "supabase",
  [
    "secrets",
    "set",
    `FIREBASE_PROJECT_ID=${creds.project_id}`,
    `FIREBASE_CLIENT_EMAIL=${creds.client_email}`,
    `FIREBASE_PRIVATE_KEY=${creds.private_key}`,
    "--project-ref",
    "eylztwbrgnglsxqudcgh",
  ],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);

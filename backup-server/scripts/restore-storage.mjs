// Upload backed-up storage files into the target Supabase project's buckets.
// Usage:
//   TARGET_SUPABASE_URL=... TARGET_SERVICE_ROLE_KEY=... \
//     node scripts/restore-storage.mjs ./restore-work/storage
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const storageDir = path.resolve(process.argv[2] || "./restore-work/storage");
const url = process.env.TARGET_SUPABASE_URL;
const key = process.env.TARGET_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Set TARGET_SUPABASE_URL and TARGET_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

for (const bucket of await fs.readdir(storageDir)) {
  const bucketDir = path.join(storageDir, bucket);
  if (!(await fs.stat(bucketDir)).isDirectory()) continue;

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {});

  const files = await walk(bucketDir);
  let uploaded = 0;

  for (const file of files) {
    const objectPath = path.relative(bucketDir, file).split(path.sep).join("/");
    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectPath, await fs.readFile(file), { upsert: true });
    if (error) console.error(`Failed ${bucket}/${objectPath}: ${error.message}`);
    else uploaded += 1;
  }

  console.log(`${bucket}: ${uploaded}/${files.length} files uploaded`);
}

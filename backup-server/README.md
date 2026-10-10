# CitiSense Backup

A nightly GitHub Actions job copies CitiSense data outside Supabase.
If Supabase goes down or loses data, the system can be rebuilt from these files.

| What is backed up | File inside the archive |
| --- | --- |
| All tables, data, functions, triggers and RLS policies (public schema) | `db-public.dump` |
| Login accounts (auth users and identities) | `db-auth-users.sql` |
| Complaint photos, profile pictures and validation photos | `storage/<bucket>/…` |
| What was backed up and when | `manifest.json` |

## Recovery targets

- **RPO (max data loss): 24 hours.** Backups run automatically at 2:00 AM (Asia/Manila).
- **RTO (time to recover): about 4 hours.** Create a new database, then run the two restore commands below.
- **Retention:** 14 days.
- **3-2-1 rule:** Supabase (live), GitHub backups, and a weekly USB copy downloaded by the admin.

## GitHub Actions setup

The workflow `.github/workflows/backup.yml` saves each backup as an **encrypted `.7z` artifact**.

**Setup (one time):**
1. Make sure the GitHub repo is **Private** (Settings → General → Danger Zone → Change visibility).
2. Add four secrets under Settings → Secrets and variables → Actions → **New repository secret**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_DB_URL`: the **Session pooler** URI, since GitHub runners can't reach the IPv6-only direct connection.
   - `BACKUP_PASSWORD`: a strong password that opens the backup files. Store it in a password manager.
3. Push the workflow file, then go to **Actions → Nightly Backup → Run workflow** to test it.

**Daily use:**
- **Check:** in the Actions tab, a green check means a good backup. Open a run to see the summary (size and photo counts). GitHub emails the repo owner when a run fails.
- **Back up now:** Actions → Nightly Backup → **Run workflow**.
- **Download:** open a run → **Artifacts** → download, then unzip.
  Open the `.7z` with 7-Zip (Windows) or Keka / The Unarchiver (Mac) using `BACKUP_PASSWORD`.
  Inside is the `citisense-….tar.gz` used by the restore steps below.

## Restore (disaster recovery)

You need `psql` and `pg_restore` version 17 (`brew install postgresql@17` on macOS).

```bash
# 1. New Supabase project (or any PostgreSQL 17 database) -> copy its connection string
TARGET_DB_URL="postgresql://..." ./scripts/restore.sh citisense-20261010-020000.tar.gz

# 2. Upload photos to the new project's storage
TARGET_SUPABASE_URL="https://NEW-REF.supabase.co" TARGET_SERVICE_ROLE_KEY="..." \
  node scripts/restore-storage.mjs ./restore-work/storage
```

3. Point the app's `EXPO_PUBLIC_SUPABASE_URL` and anon key at the new project, then redeploy the Edge Functions (`supabase functions deploy`).
4. Photo links saved in complaints still contain the old project address.
   If the project changed, update them with one SQL `replace()` on the photo URL columns.

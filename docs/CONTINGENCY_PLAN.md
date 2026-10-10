# CitiSense Emergency & Recovery Contingency Plan

**Purpose:** keep citizen complaints flowing and protect city data when CitiSense or its cloud provider (Supabase) is down.
It is written so non-IT staff can follow it step by step.

---

## 1. Recovery targets

| Target | Value | How it is met |
| --- | --- | --- |
| **RPO** (max data that may be lost) | **24 hours** | Automatic nightly backup at 2:00 AM by GitHub Actions, stored outside Supabase (encrypted) |
| **RTO** (max time to restore service) | **4 hours** | Documented restore scripts plus a backup archive ready to download |
| Backup retention | 14 days | GitHub artifact retention |
| Offline copy | Weekly | Admin downloads the latest backup to a USB drive or personal computer |

**3-2-1 backup rule:**
- **3 copies:** Supabase (live), GitHub backups, and the weekly USB copy.
- **2 kinds of storage:** cloud and a local USB drive.
- **1 copy off-site:** GitHub is a separate company from Supabase.

---

## 2. What we protect

| Data | Where it lives | Backed up as |
| --- | --- | --- |
| Complaints, statuses, per-department progress, notifications, audit logs | Supabase database | `db-public.dump` |
| User accounts and logins | Supabase Auth | `db-auth-users.sql` |
| Complaint photos and profile pictures | Supabase Storage | `storage/` folder |
| App source code and settings | Git repository | Git history |
| Secret keys | Hosting dashboard and sealed envelope | Not in backups (kept by the system owner) |

---

## 3. Roles (no IT expert required)

| Role | Who | Responsibilities |
| --- | --- | --- |
| **Incident Lead** | CitiSense System Administrator (admin account) | Declares the incident, follows this plan, informs offices, keeps the incident log |
| **Recovery Operator** | System developer / maintainer (or the City MIS office) | Runs the restore steps in Section 6 |
| **Department Heads** | Each office head | Switch to manual logging (Section 5), then encode the entries back into CitiSense |
| **Communications** | City Information Office | Posts public notices (Section 7) |

Keep a printed **Contact Sheet** with the names and phone numbers for each role, the hosting login owner, and where the sealed envelope (emergency key and database password) is stored.

---

## 4. Detection: how we know something is wrong

1. **Backup failure alert.** GitHub emails the repo owner automatically if the nightly backup fails.
2. **In-app banner.** When the servers can't be reached but the phone has internet, every user sees
   **"CitiSense is temporarily unavailable — Emergency? Tap to call 911."**
3. **User reports.** Citizens or department heads report that the app is not loading.
4. **Admin check.** Each week the admin opens GitHub → **Actions → Nightly Backup** and confirms recent runs have green checks.

---

## 5. Severity levels and response

| Level | Example | Expected duration | Action |
| --- | --- | --- | --- |
| **1 – Minor** | Slow app, one feature failing (AI analysis, maps, notifications) | Minutes to hours | Monitor. Complaints can still be submitted. Inform affected offices. |
| **2 – Major outage** | Supabase down, nobody can log in or submit | Up to 4 hours | **Manual Operations Mode** (below). Wait for the provider to recover. |
| **3 – Disaster** | Data deleted or corrupted, account suspended, project lost, outage over 4 hours | Hours or more | **Manual Operations Mode** plus **Full Restore** (Section 6) |

### Manual Operations Mode (Levels 2 and 3)

The goal is that **no citizen concern is lost** while the system is down.

1. **Emergencies always go by phone.** Citizens call:
   - **911** (national emergency)
   - **CBDRRMO 0945 685 2435**
   - **Bogo City Police 0905 600 2028**
   - **Bogo City Fire 0917 127 9158**
2. **Non-emergency complaints** are received by walk-in, phone or SMS at the City Hall help desk and logged on the **Manual Complaint Log Form** (paper or spreadsheet) with these columns:
   - log no.
   - date/time
   - citizen name
   - contact no.
   - category
   - location
   - description
   - assigned office
   - received by
3. Department heads keep working on known complaints and note status changes on paper (complaint ID, new status, date, name).
4. **After recovery,** staff encode every manual log into CitiSense within **24 hours**, marked "Encoded from manual log #___".
   The Incident Lead checks that the counts match.

---

## 6. Recovery procedures

### A. Provider outage (Level 2): wait and verify
1. Check the provider status page: https://status.supabase.com
2. Keep Manual Operations Mode on.
3. When the health check is green again:
   - log in as admin and as one department head;
   - submit one test complaint;
   - check that photos load.
4. Announce "service restored" (Section 7) and encode the manual logs.

### B. Lost or corrupted data (Level 3): Full Restore, target 4 hours
Done by the **Recovery Operator**. Detailed commands are in `backup-server/README.md`.

| Step | Action | Est. time |
| --- | --- | --- |
| 1 | Download the latest good backup from GitHub (**Actions → Nightly Backup → Artifacts**) and open it with `BACKUP_PASSWORD` | 15 min |
| 2 | Create a new Supabase project (or any PostgreSQL 17 server) | 15 min |
| 3 | `restore.sh`: restore the database and user accounts | 30 min |
| 4 | `restore-storage.mjs`: upload photos and avatars | 30–60 min |
| 5 | Redeploy the Edge Functions and set their secrets | 30 min |
| 6 | Point the app to the new project (`EXPO_PUBLIC_SUPABASE_URL` and anon key), publish an update or new build | 60 min |
| 7 | Verification checklist (below) | 20 min |

**Verification checklist:**
- [ ] Admin, department head and citizen accounts can log in
- [ ] Complaint count matches the backup manifest (± complaints filed after the backup time)
- [ ] Complaint photos and profile pictures display
- [ ] A new complaint can be submitted and routed by the AI
- [ ] Department heads receive notifications
- [ ] A manual **Run workflow** of Nightly Backup on GitHub finishes with a green check

**Data gap:** complaints filed between the last backup and the incident (up to 24 hours) are re-entered from the Manual Complaint Log and from citizens' reports.

---

## 7. Communication templates

**Outage notice (Facebook page / SMS):**
> CitiSense is temporarily unavailable due to a technical issue. For emergencies, call 911 or CBDRRMO at 0945 685 2435.
> For other concerns, visit or call the City Hall help desk. All reports will be recorded. We will announce when service is restored.

**Restored notice:**
> CitiSense is back online. Concerns reported during the downtime have been recorded and are being processed. Thank you for your patience.

---

## 8. Prevention and readiness

| Activity | Frequency | Owner |
| --- | --- | --- |
| Check GitHub **Actions → Nightly Backup** shows green checks | Weekly | Admin |
| Download the latest backup to a USB drive | Weekly | Admin |
| Review backup failures and the incident log | Monthly | Incident Lead |
| **Recovery drill:** restore the latest backup into a test project and run the verification checklist; record the actual time taken (actual RTO) | Every 3 months | Recovery Operator |
| Update the Contact Sheet and check the sealed envelope | Every 6 months or when staff change | Incident Lead |
| Rotate `BACKUP_PASSWORD`, the database password, and GitHub access | Yearly or after any staff departure | System owner |

---

## 9. Incident log (fill in for every incident)

| Field | Entry |
| --- | --- |
| Date/time detected | |
| Detected by (alert / user / staff) | |
| Severity level | |
| Description | |
| Actions taken (with times) | |
| Manual logs received | |
| Date/time restored | |
| Total downtime (actual RTO) | |
| Data lost (actual RPO) | |
| Lessons learned / follow-up | |

# CitiSense Security Hardening & Firewall

CitiSense uses **defense in depth**: several layers of protection, each acting as a firewall between users and the data.

```
Phone app ──HTTPS/TLS──▶ Supabase API ──▶ Database firewall (RLS + privileges + guards) ──▶ Data
                              │
                              ├─ Auth: login required, rate limits, banned users blocked
                              └─ Storage: images only, size limits, owner-only overwrite
Backups ──SSL──▶ Database (GitHub Actions, encrypted .7z output)
```

## 1. Database firewall (applied: migration `20261010120000_security_hardening.sql`)

| Control | What it blocks |
| --- | --- |
| **Row-Level Security on all 9 tables** | Citizens see only their own complaints; department heads only their office's; admins everything |
| **No signed-out (anon) access** | Without login, no table or database function can be reached, even with the public app key |
| **Privileged functions locked** | Internal notification and reminder functions run only inside the database, never from the app |
| **Notification policies tightened** | Users can't read other people's notifications or send fake ones to other citizens or department heads |
| **Citizen status guard** | Citizens can't mark their own complaint Completed / In Progress or move it to another account. Only re-submitting validation is allowed |
| **Submission rate limit** | At most 10 complaints per citizen per hour (anti-spam / flooding) |
| **Admin-only actions** | Role changes and bans check the admin role inside the database, not just in the app |

**Verified by test (rolled back, no data changed):** 11 attack attempts blocked.
Department head status updates, notifications, admin completion and citizen validation still work.

## 2. Storage firewall

| Control | Setting |
| --- | --- |
| Allowed file types | Images only (JPEG, PNG, WebP, HEIC) |
| Size limits | Complaint and validation photos 10 MB; profile pictures 5 MB |
| Overwrite protection | Only the uploader can replace a photo |
| Profile pictures | Users can only upload into their own folder |

## 3. Network and transport

| Control | Status |
| --- | --- |
| HTTPS/TLS for all app traffic | On (Supabase default) |
| SSL on database connections | On. Turn on **Enforce SSL** in the dashboard (Section 5) |
| Secrets | Kept in `.env` / GitHub Secrets / Supabase secrets, never in code. The service role key is never in the app |
| Backups | Encrypted (AES-256 `.7z`) and stored outside Supabase |

## 4. Application controls

- Login is required for every screen except sign-in, sign-up and password reset.
- Banned accounts are blocked.
- Role-based navigation: citizen, department head and admin screens are separated, and the database enforces the same rules.
- Profanity filtering, input validation and photo privacy blurring are applied on complaint submission.
- Audit logs record account activity, complaint status changes, reassignments and admin actions.

## 5. Dashboard settings (manual, by the system owner)

Supabase Dashboard → your project:

1. **Database → Settings → SSL Configuration → Enforce SSL on incoming connections: ON.**
   Backups already use SSL, so they keep working.
2. **Authentication → Rate Limits:** keep the defaults or lower them (sign-ins, sign-ups, password reset emails per hour).
3. **Authentication → Providers → Email:**
   - Minimum password length **8+**, requiring letters and numbers.
   - **Confirm email** ON.
4. **Authentication → Attack Protection:** enable **CAPTCHA** (hCaptcha / Cloudflare Turnstile) if bots become a problem. This requires a small app update.
5. **Database → Network Restrictions (IP firewall):** optional. Allowing only listed IP addresses to connect directly to the database would also block the nightly GitHub backup, because GitHub's addresses change. The app is not affected, since it uses the HTTPS API. Enable it only with a fixed-IP backup server.

## 6. Ongoing

| Task | When |
| --- | --- |
| Check Supabase **Advisors → Security** for warnings | Monthly |
| Review audit logs for unusual admin actions | Monthly |
| Rotate database password, `BACKUP_PASSWORD` and service keys | Yearly, or when staff leave |
| Remove accounts of staff who leave | Immediately |

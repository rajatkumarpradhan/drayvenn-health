# Hard gates (set 2026-09-29 via main, from user's data-safety concerns)

1. ~~Replace the 4-digit PIN clinic login with proper auth~~ DONE 29 Sep: per-clinic
   email + PBKDF2-hashed password, 5-fail lockout (15 min), 12-hour server-side session tokens.
   Demo credentials for the 5 sample clinics were handed to main (not stored in repo).
2. Patient data must never touch AI processing. (Chat function sends clinic/doctor data
   and the conversation only - no bookings table data.)
3. Demo phase only until real clinics onboard: fictional seed clinics, all marked "Sample clinic".

# Decisions log (29 Sep, Step 1 security pass)
- Phone-only "My Bookings" list DISABLED until OTP ships (Step 3). GET /api/bookings?phone= returns 410.
  Track page stays: long ref + phone required, 8 fails / 10 min per IP -> 15 min block (429).
- Booking refs: DH- + 10 random chars going forward (old 5-char refs still valid).
- Consent checkbox (links to privacy.html) required before a booking can be confirmed.
- Retention: bookings auto-delete 1 year after appointment date (purge runs on booking create
  + admin summary load; Pages has no cron). Privacy policy states this + hello@drayvennlab.in.
- Data minimization: bookings store only name, age, phone, slot, short concern (<=300 chars).
- Secrets: Workers AI is a server-side binding (env.AI); no keys in public/. D1 reachable only
  through Functions. All patient reads require ref + phone.
- Rollback: every deploy keeps a permanent preview URL; dashboard "Roll back" button or
  redeploy an older git commit (repo: github.com/rajatkumarpradhan/drayvenn-health, private).

Deploy mechanism: wrangler OAuth (~/.wrangler/config/default.toml), project drayvenn-health,
D1 drayvenn-health-db (id 9ef176b1-d282-4a5e-83d6-2aacc1be0d20), migrations in ./migrations.
Redeploy: npx wrangler pages deploy public --project-name drayvenn-health --branch main

## Step 3 decisions (29 Sep 2026)
- Patient auth: Google sign-in + email OTP are the two live methods.
- Phone (SMS) OTP is BUILT but OFF - DLT registration in India costs Rs 5,000+GST,
  deferred. The provider interface (_sms.js, MSG91) and endpoints stay; they answer
  a clean provider-not-configured 503. WhatsApp OTP is the pilot-stage upgrade (no DLT).
- Email OTP goes through hello@drayvennlab.in (mailbox recovery in progress) via a
  transactional provider (Brevo first target); login-alert emails use the same mailbox.
- Security bar for both: 10-min code expiry, 5 attempts then 15-min identifier block,
  PBKDF2-hashed codes with per-code salt, SHA-256-hashed session tokens (30-day expiry,
  7-day rotation), rate limits on all auth endpoints, generic no-enumeration responses,
  login-alert hook (email when the mailbox is live), CSP + HSTS shipped.

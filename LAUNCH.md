# Launch checklist (nothing here has been run; run only after the owner says the site is final)

State on 5 Oct 2026: redesign lives on the `redesign` preview branch + preview D1. Production (`main`, DB `drayvenn-health-db`)
still has the OLD site and migrations up to 0010 only.

## Before going live
1. Owner answers (legal pages): legal entity name + registered address, grievance officer name, jurisdiction city,
   confirm the "7 day" reply/delete promise, confirm 77355 21019 is on WhatsApp. Lawyer/CA review of /privacy and /terms.
2. Sample data: prod has 5 SAMPLE clinics with demo clinic logins (migration 0006). Before real clinics:
   delete the sample clinics, their doctors and their clinic_admins rows (or rotate those passwords). Remove the
   "Sample clinics showing how Drayvenn works" line on the home page and in /about and /terms when no sample clinic is left.
3. Notifications: booking-confirmation email (Brevo) is not wired. Until it is, nothing tells the clinic or patient.

## Go-live steps, in order
1. `bash scripts/prod-migrate.sh`               (dry run: lists pending migrations)
2. `CONFIRM_PROD=yes bash scripts/prod-migrate.sh`   (backup, then apply 0011..0022)
3. Remove noindex on public pages only: the global `X-Robots-Tag` line in public/_headers (keep it for /admin, /owner*, /clinic-admin/*)
   and `<meta name="robots">` in index.html, privacy.html, terms.html, about.html. Keep noindex on admin pages.
4. Deploy the production branch: `npx wrangler pages deploy public --project-name drayvenn-health --branch main`
5. `CONFIRM_PROD=yes bash scripts/owner-setup-link.sh prod` -> send the link privately to the owner; he sets his own password.
6. Remove the demo platform account if it exists: `DELETE FROM platform_admins` (it was only ever created on preview).
7. Connect drayvennlab.in as a Cloudflare Pages custom domain (DNS is at GoDaddy; keep the Zoho mail records).
8. Smoke test: booking -> track -> clinic confirm on the live domain; delete the test booking.

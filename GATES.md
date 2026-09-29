# Hard gates (set 2026-09-29 via main, from user's data-safety concerns)

Before ANY real clinic/patient onboarding:
1. Replace the 4-digit PIN clinic login with proper auth: per-clinic email+password or better,
   server-side sessions, no PIN in query params.
2. Patient data must never touch AI processing.
3. Demo phase only until then: fictional seed clinics, demo-grade PIN.

Deploy mechanism: wrangler OAuth (~/.wrangler/config/default.toml), project drayvenn-health,
D1 drayvenn-health-db (id 9ef176b1-d282-4a5e-83d6-2aacc1be0d20), migrations in ./migrations.
Redeploy: npx wrangler pages deploy public --project-name drayvenn-health --branch main

# Weekly D1 backup - scheduled agent runbook

## What the run does (scripts/backup-d1.sh)
1. Purge: `wrangler d1 execute drayvenn-health-db --remote --command "DELETE FROM bookings WHERE date < date('now', '-1 year')"` (mirrors functions/api/_lib.js purgeOldBookings; non-fatal if skipped)
2. Export: `wrangler d1 export drayvenn-health-db --remote --output /tmp/drayvenn-health-db-<stamp>.sql`
3. Encrypt to the GPG public key in backup-pubkey.asc (no passphrase needed to encrypt) -> .sql.gpg, shreds the raw .sql
4. Upload to Drive folder "Drayvenn Health backups" (id 1EHbmqxgJN3XBGrwZBFEwuCp-U-CtJcCD - exists, search first, do not create a duplicate)
5. Verify: list-folder shows the new file; report folder link + filename + size

## Environment needed
- This repo (scripts/, wrangler.toml); Node+npx (wrangler runs via npx, no global install); gpg, shred (stock Linux)
- D1: database_name drayvenn-health-db, id 9ef176b1-d282-4a5e-83d6-2aacc1be0d20
- Drive: user's connected Google account with write scope (connected 29 Sep 2026)

## Secrets - the two hard constraints
1. Cloudflare auth. wrangler OAuth (~/.wrangler/config/default.toml) lives only in the workspace where login ran; tokens expire hourly and the refresh token rotates (scripts/refresh-cf-auth.sh keeps it alive only in that same workspace). A fresh agent workspace has no OAuth file. Fallback: the scoped Cloudflare API Token (Account > D1 > Edit) vaulted as "Drayvenn D1 backup CF API token" - copy it into the sandbox with `tools vault write-file` and export it as CLOUDFLARE_API_TOKEN for wrangler (wrangler accepts an API token with no OAuth). Use the vaulted token as-is; do not mint fresh ones.
   HARD RULE (confirmed with main 15 Oct 2026): never create, roll, or delete Cloudflare API tokens. The weekly backup duty does not authorize credential rotation. If neither refresh-cf-auth.sh nor the vaulted token gets wrangler authenticated, report blocked to the parent agent and stop - the parent will get the user's explicit decision.
2. Backup encryption - RESOLVED 29 Sep: the script encrypts to the GPG public key in backup-pubkey.asc (in repo). No secret is needed to run the weekly backup. The private key + key passphrase are vaulted for the user ("Drayvenn D1 backup private key" / "Drayvenn D1 backup key passphrase"). See BACKUP.md for the decrypt steps and the one legacy symmetric backup.

## Suggested schedule
Cadence wake, weekly (interval 10080 min). Prompt: run scripts/backup-d1.sh per this runbook, verify the Drive upload, report filename/size/folder link or the exact failure. On any auth failure: try refresh-cf-auth.sh once, then the vaulted API token via `tools vault write-file`; if still failing, report blocked. Never create, roll, or delete credentials.

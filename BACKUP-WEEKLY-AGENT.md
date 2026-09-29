# Weekly D1 backup - scheduled agent runbook

## What the run does (scripts/backup-d1.sh)
1. Purge: `wrangler d1 execute drayvenn-health-db --remote --command "DELETE FROM bookings WHERE date < date('now', '-1 year')"` (mirrors functions/api/_lib.js purgeOldBookings; non-fatal if skipped)
2. Export: `wrangler d1 export drayvenn-health-db --remote --output /tmp/drayvenn-health-db-<stamp>.sql`
3. Encrypt: `gpg --batch --symmetric --cipher-algo AES256 --passphrase "$DH_BACKUP_PASS"` -> .sql.gpg, shreds the raw .sql
4. Upload to Drive folder "Drayvenn Health backups" (id 1EHbmqxgJN3XBGrwZBFEwuCp-U-CtJcCD - exists, search first, do not create a duplicate)
5. Verify: list-folder shows the new file; report folder link + filename + size

## Environment needed
- This repo (scripts/, wrangler.toml); Node+npx (wrangler runs via npx, no global install); gpg, openssl, shred (stock Linux)
- D1: database_name drayvenn-health-db, id 9ef176b1-d282-4a5e-83d6-2aacc1be0d20
- Drive: user's connected Google account with write scope (connected 29 Sep 2026)

## Secrets - the two hard constraints
1. Cloudflare auth. wrangler OAuth (~/.wrangler/config/default.toml) lives only in the workspace where login ran; tokens expire hourly and the refresh token rotates (scripts/refresh-cf-auth.sh keeps it alive only in that same workspace). A fresh agent workspace has no OAuth file. Clean fix: a scoped Cloudflare API Token (Account > D1 > Edit) used as CLOUDFLARE_API_TOKEN env - wrangler accepts it with no OAuth. But see constraint 2: an agent cannot read it back out of the vault.
2. Backup passphrase - RESOLVED 29 Sep: the script now encrypts to the GPG public key in backup-pubkey.asc (in repo). No secret is needed to run the weekly backup. The private key + key passphrase are vaulted for the user (agent-designated logins "Drayvenn D1 backup private key" / "Drayvenn D1 backup key passphrase"). See BACKUP.md for the decrypt steps and the one legacy symmetric backup.

## Suggested schedule
Cadence wake, weekly (interval 10080 min). Prompt: run scripts/backup-d1.sh per this runbook, verify the Drive upload, report filename/size/folder link or the exact failure. One retry on wrangler auth failure after refresh; then report blocked.

# D1 backup & restore

## Weekly backup (automated)
`scripts/backup-d1.sh` exports the remote D1 database, encrypts it with gpg AES256,
and prints the .gpg file path. The encrypted file is then uploaded to the user's
Google Drive folder "Drayvenn Health backups" (upload currently blocked: the Drive
connection needs re-authorization with write scope).

    DH_BACKUP_PASS='<backup passphrase>' bash scripts/backup-d1.sh

The backup passphrase is held by the user only. It is NOT in this repo and NOT in
Cloudflare. Lose it and the backups cannot be decrypted.

## Restore steps
1. Download the .gpg file from Google Drive.
2. Decrypt:  gpg --decrypt --output restore.sql drayvenn-health-db-YYYYMMDD-HHMM.sql.gpg
   (enter the backup passphrase when asked)
3. Inspect restore.sql (it is plain SQL: schema + INSERTs).
4. Restore into the live DB:
   npx wrangler d1 execute drayvenn-health-db --remote --file=restore.sql
   (For a full rebuild, drop/recreate tables first - the export includes CREATE TABLE.)
5. Smoke-test https://drayvenn-health.pages.dev/ and /admin.html after restore.

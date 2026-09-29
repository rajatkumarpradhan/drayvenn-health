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

## Encryption scheme change (29 Sep 2026, evening)
Backups from 30 Sep 2026 onward are encrypted to the GPG public key in `backup-pubkey.asc`
(fingerprint EB2940224939CE4F3C1AD1C5613AC1291677290E, "Drayvenn Health D1 Backup <backup@drayvennlab.in>").
Running a backup needs NO secret; decrypting needs the private key + its passphrase,
both in the user's vault (agent-designated logins "Drayvenn D1 backup private key" and
"Drayvenn D1 backup key passphrase").

Exception: the first backup, `drayvenn-health-db-20260929-1842.sql.gpg` (uploaded 29 Sep 6:43 PM),
is symmetric AES256 and opens with the passphrase in vault login "Drayvenn D1 backup passphrase":
  gpg --decrypt --passphrase '<that passphrase>' drayvenn-health-db-20260929-1842.sql.gpg

## Decrypt a current (pubkey) backup
  # import the private key from the vault entry into gpg, then:
  gpg --decrypt drayvenn-health-db-<stamp>.sql.gpg   # prompts for the key passphrase

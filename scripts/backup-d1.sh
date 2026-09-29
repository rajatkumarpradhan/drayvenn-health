#!/bin/bash
# Weekly D1 backup: export remote DB, encrypt with gpg (AES256), print the .gpg path.
# The backup passphrase lives with the user only - it is never stored in this repo.
# Usage: DH_BACKUP_PASS='<passphrase>' bash scripts/backup-d1.sh
set -e
cd "$(dirname "$0")/.."
bash scripts/refresh-cf-auth.sh >/dev/null 2>&1 || true
STAMP=$(date +%Y%m%d-%H%M)
# Retention purge (folded into the weekly run, mirrors functions/api/_lib.js purgeOldBookings):
npx wrangler d1 execute drayvenn-health-db --remote --command "DELETE FROM bookings WHERE date < date('now', '-1 year')" >/dev/null 2>&1 || echo "purge skipped (non-fatal)"
RAW=/tmp/drayvenn-health-db-$STAMP.sql
OUT=/tmp/drayvenn-health-db-$STAMP.sql.gpg
npx wrangler d1 export drayvenn-health-db --remote --output "$RAW" --no-schema false >/dev/null 2>&1 || \
  npx wrangler d1 export drayvenn-health-db --remote --output "$RAW" >/dev/null
[ -s "$RAW" ] || { echo "export failed" >&2; exit 1; }
[ -n "$DH_BACKUP_PASS" ] || { echo "set DH_BACKUP_PASS" >&2; exit 1; }
gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$DH_BACKUP_PASS" --output "$OUT" "$RAW"
shred -u "$RAW" 2>/dev/null || rm -f "$RAW"
echo "$OUT"

#!/bin/bash
# Weekly D1 backup: export remote DB, encrypt to the backup PUBLIC key (backup-pubkey.asc,
# in repo, not secret), print the .gpg path. No secret is needed to RUN the backup.
# Only the private key (user's vault: "Drayvenn D1 backup private key", passphrase in
# "Drayvenn D1 backup key passphrase") can decrypt.
# Usage: bash scripts/backup-d1.sh
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
# fresh throwaway keyring so runs never depend on local gpg state
export GNUPGHOME=$(mktemp -d /tmp/gpg-dh-backup.XXXXXX); chmod 700 "$GNUPGHOME"
trap 'rm -rf "$GNUPGHOME"' EXIT
gpg --batch --yes --trust-model always --recipient-file backup-pubkey.asc --encrypt --output "$OUT" "$RAW"
shred -u "$RAW" 2>/dev/null || rm -f "$RAW"
echo "$OUT"

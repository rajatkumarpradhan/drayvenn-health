#!/bin/bash
# Production DB migration prep (NOT run yet). Applies pending migrations 0013..0022 to the PRODUCTION D1.
# Safe by default: DRY RUN. Real run needs: CONFIRM_PROD=yes bash scripts/prod-migrate.sh
# Order: backup first (encrypted, to /tmp), then apply each migration file in order.
set -e
cd "$(dirname "$0")/.."
bash scripts/refresh-cf-auth.sh >/dev/null 2>&1 || true
DB=drayvenn-health-db
APPLIED=$(npx wrangler d1 execute $DB --remote --json --command "select name from d1_migrations" 2>/dev/null | python3 -c "import sys,json;print(' '.join(r['name'] for r in json.load(sys.stdin)[0]['results']))")
PENDING=""
for f in migrations/*.sql; do n=$(basename "$f"); case " $APPLIED " in *" $n "*) ;; *) PENDING="$PENDING $n";; esac; done
echo "Already applied on prod: $(echo $APPLIED | wc -w) migrations"
echo "Pending:${PENDING:- none}"
[ -z "$PENDING" ] && exit 0
if [ "$CONFIRM_PROD" != "yes" ]; then echo "DRY RUN - nothing changed. Re-run with CONFIRM_PROD=yes to apply."; exit 0; fi
echo "Backup before migrating..."; bash scripts/backup-d1.sh
npx wrangler d1 migrations apply $DB --remote
echo "Done. Verify: owner_account/owner_setup/owner_sessions/owner_audit tables exist."

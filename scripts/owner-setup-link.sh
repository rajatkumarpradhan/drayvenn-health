#!/bin/bash
# Mint a ONE-TIME owner setup link (valid 24h, works once). Only the SHA-256 of the token is stored.
# Usage: bash scripts/owner-setup-link.sh preview|prod
# prod needs CONFIRM_PROD=yes. The owner opens the link and sets their own email + password in the page.
set -e
cd "$(dirname "$0")/.."
bash scripts/refresh-cf-auth.sh >/dev/null 2>&1 || true
case "$1" in
  preview) DB=drayvenn-health-db-preview; HOST=https://redesign.drayvenn-health.pages.dev;;
  prod) [ "$CONFIRM_PROD" = "yes" ] || { echo "prod needs CONFIRM_PROD=yes"; exit 1; }
        DB=drayvenn-health-db; HOST=${PROD_HOST:-https://drayvenn-health.pages.dev};;
  *) echo "usage: $0 preview|prod"; exit 1;;
esac
TOK=$(openssl rand -hex 24); H=$(printf %s "$TOK" | sha256sum | cut -d' ' -f1)
npx wrangler d1 execute $DB --remote --command "DELETE FROM owner_setup WHERE used_at IS NULL; INSERT INTO owner_setup (token_hash, expires_at) VALUES ('$H', datetime('now','+24 hours'))" >/dev/null
echo "$HOST/admin#setup=$TOK"

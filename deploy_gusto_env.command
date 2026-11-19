#!/bin/bash
# Pushes Gusto payroll env vars to Vercel and redeploys CashCall
set -e
cd "$(dirname "$0")"

source .env.local

TARGETS=("production" "preview" "development")

echo "▶ Setting Gusto env vars on Vercel..."

for TARGET in "${TARGETS[@]}"; do
  for VAR in GUSTO_CLIENT_ID GUSTO_CLIENT_SECRET GUSTO_REDIRECT_URI GUSTO_SANDBOX; do
    VALUE="${!VAR}"
    echo "$VALUE" | /Users/ameyaswani/node/bin/vercel env add "$VAR" "$TARGET" \
      --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
  done
done

echo "▶ Deploying to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo "✅ Done — Gusto payroll integration is live on cashcall.io"

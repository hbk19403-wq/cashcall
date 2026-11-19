#!/bin/bash
# Pushes QuickBooks + Gusto payroll env vars to Vercel and redeploys CashCall
set -e
cd "$(dirname "$0")"

source .env.local

TARGETS=("production" "preview" "development")

echo "▶ Setting QuickBooks env vars on Vercel..."

for TARGET in "${TARGETS[@]}"; do
  for VAR in QB_CLIENT_ID QB_CLIENT_SECRET QB_REDIRECT_URI; do
    VALUE="${!VAR}"
    echo "$VALUE" | /Users/ameyaswani/node/bin/vercel env add "$VAR" "$TARGET" \
      --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
  done
done

echo "▶ Deploying to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo "✅ Done — QuickBooks payroll integration is live on cashcall.io"

#!/bin/bash
# Pushes Clover env vars to Vercel and redeploys CashCall
set -e
cd "$(dirname "$0")"

source .env.local

PROJECT="cashcall-frontend"
TARGETS=("production" "preview" "development")

echo "▶ Setting Clover env vars on Vercel..."

for TARGET in "${TARGETS[@]}"; do
  for VAR in CLOVER_APP_ID CLOVER_APP_SECRET CLOVER_REDIRECT_URI CLOVER_SANDBOX; do
    VALUE="${!VAR}"
    # Remove existing then re-add
    echo "$VALUE" | /Users/ameyaswani/node/bin/vercel env add "$VAR" "$TARGET" \
      --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
  done
done

echo "▶ Deploying to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo "✅ Done — Clover integration is live on cashcall.io"

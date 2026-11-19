#!/bin/bash
# Pushes Square env vars to Vercel and redeploys CashCall
set -e
cd "$(dirname "$0")"

source .env.local

TARGETS=("production" "preview" "development")

echo "▶ Setting Square env vars on Vercel..."

for TARGET in "${TARGETS[@]}"; do
  for VAR in SQUARE_APP_ID SQUARE_APP_SECRET SQUARE_REDIRECT_URI SQUARE_SANDBOX; do
    VALUE="${!VAR}"
    echo "$VALUE" | /Users/ameyaswani/node/bin/vercel env add "$VAR" "$TARGET" \
      --token "$VERCEL_TOKEN" --yes 2>/dev/null || true
  done
done

echo "▶ Deploying to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo "✅ Done — Square integration is live on cashcall.io"

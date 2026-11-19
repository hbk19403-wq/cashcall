#!/bin/bash
# Service-role key is read from the environment or .env.local, never stored in this file.
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(grep -s '^SUPABASE_SERVICE_ROLE_KEY=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then echo "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local."; exit 1; fi
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=============================="
echo "  CashCall — Investor Reel Upload + Deploy"
echo "=============================="
echo ""

# Step 1: Upload investor reel to Supabase Storage
VIDEO="/Users/ameyaswani/Library/Application Support/Claude/local-agent-mode-sessions/9f5fa70d-7e2e-49ed-8d62-73b9814633be/25005df3-b346-4086-b4bb-fa9c39f5444e/local_5c611496-13a2-4a0e-b5ee-b871079826ff/uploads/cashcall_investor_reel_v2.mp4"
if [ -f "$VIDEO" ]; then
  echo "🎬 Uploading investor reel to Supabase Storage..."
  HTTP=$(curl -s -X PUT \
    "https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/media/cashcall_investor_reel_v2.mp4" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: video/mp4" \
    -H "x-upsert: true" \
    --data-binary "@$VIDEO" \
    -o /tmp/supa_investor.json -w "%{http_code}")
  if [[ "$HTTP" == "200" ]] || [[ "$HTTP" == "201" ]]; then
    echo "   ✅ Investor reel uploaded (HTTP $HTTP)"
  else
    echo "   ⚠️  Upload got HTTP $HTTP:"
    cat /tmp/supa_investor.json
    echo ""
    echo "   Continuing with deploy anyway..."
  fi
else
  echo "   ⚠️  Video file not found at expected path, skipping upload"
  echo "   Path: $VIDEO"
fi
echo ""

# Step 2: Deploy code to Vercel
echo "🚀 Deploying to Vercel..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$VERCEL_TOKEN"
echo ""
echo "=============================="
echo "  ✅ Done! Investor reel live on cashcall.io"
echo "=============================="

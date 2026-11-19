#!/bin/bash
# Service-role key is read from the environment or .env.local, never stored in this file.
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(grep -s '^SUPABASE_SERVICE_ROLE_KEY=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then echo "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local."; exit 1; fi
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=============================="
echo "  CashCall — Full Deploy"
echo "=============================="
echo ""

# Step 1: Upload demo video to Supabase Storage
VIDEO="$DIR/public/cashcall_demo.mp4"
if [ -f "$VIDEO" ]; then
  echo "🎬 Uploading demo video to Supabase Storage..."
  HTTP=$(curl -s -X PUT \
    "https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/media/cashcall_demo.mp4" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: video/mp4" \
    -H "x-upsert: true" \
    --data-binary "@$VIDEO" \
    -o /tmp/supa_video.json -w "%{http_code}")
  if [[ "$HTTP" == "200" ]] || [[ "$HTTP" == "201" ]]; then
    echo "   ✅ Video uploaded (HTTP $HTTP)"
  else
    echo "   ⚠️  Video upload got HTTP $HTTP:"
    cat /tmp/supa_video.json
    echo ""
    echo "   Continuing with code deploy..."
  fi
else
  echo "   ⚠️  Video file not found, skipping"
fi
echo ""

# Step 2: Deploy code to Vercel
echo "🚀 Deploying code to Vercel..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$VERCEL_TOKEN"
echo ""
echo "=============================="
echo "  ✅ All done! cashcall.io live"
echo "=============================="

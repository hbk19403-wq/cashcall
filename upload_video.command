#!/bin/bash
# Service-role key is read from the environment or .env.local, never stored in this file.
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(grep -s '^SUPABASE_SERVICE_ROLE_KEY=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then echo "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local."; exit 1; fi
# CashCall — Upload demo video to Supabase Storage
echo "🎬 Uploading cashcall_demo.mp4 to Supabase Storage..."
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEO="$DIR/public/cashcall_demo.mp4"
if [ ! -f "$VIDEO" ]; then
  echo "❌ Video file not found: $VIDEO"
  exit 1
fi
curl -X PUT \
  "https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/media/cashcall_demo.mp4" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: video/mp4" \
  -H "x-upsert: true" \
  --data-binary "@$VIDEO" \
  -o /tmp/supa_upload.json -w "HTTP %{http_code}"
echo ""
cat /tmp/supa_upload.json
echo ""
echo "✅ Done! Video is live at:"
echo "   https://lhwepylnuurjbarkfugo.supabase.co/storage/v1/object/public/media/cashcall_demo.mp4"

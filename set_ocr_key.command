#!/bin/bash
cd "$(dirname "$0")"

TOKEN="$VERCEL_TOKEN"
PROJECT_ID="prj_SjxdQhVXH0Tr6mvzlLkIRaW2wDc2"
VERCEL="/Users/ameyaswani/node/bin/vercel"

ANTHROPIC_KEY=$(grep "^ANTHROPIC_API_KEY" .env.local | cut -d'=' -f2-)
if [ -z "$ANTHROPIC_KEY" ]; then
  echo "❌ ANTHROPIC_API_KEY not found in .env.local"
  exit 1
fi

echo "🔑 Setting ANTHROPIC_API_KEY for CashCall..."

for ENV_ID in $(curl -s "https://api.vercel.com/v9/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $TOKEN" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); [print(e['id']) for e in d.get('envs',[]) if e.get('key')=='ANTHROPIC_API_KEY']" 2>/dev/null); do
  curl -s -X DELETE "https://api.vercel.com/v9/projects/$PROJECT_ID/env/$ENV_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "  Removed old entry $ENV_ID"
done

RESULT=$(curl -s -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"key\":\"ANTHROPIC_API_KEY\",\"value\":\"$ANTHROPIC_KEY\",\"type\":\"encrypted\",\"target\":[\"production\",\"preview\",\"development\"]}")

echo "$RESULT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if isinstance(d, list) and len(d) > 0:
    print('✅ ANTHROPIC_API_KEY set for:', [e.get('target') for e in d])
elif 'error' in d:
    print('❌ Error:', d['error'])
else:
    print('Response:', d)
" 2>/dev/null

echo ""
echo "🚀 Deploying CashCall..."
"$VERCEL" deploy --prod --yes --token="$TOKEN"
echo ""
echo "✅ Done! OCR should work at cashcall.io in 2-3 minutes."

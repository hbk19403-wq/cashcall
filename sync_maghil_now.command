#!/bin/bash
# Triggers a full 30-day Maghil POS sync for all 6 HBK locations via the live API
set -e
cd "$(dirname "$0")"
source .env.local

BASE="https://cashcall.io/api/pos/maghil/sync"

HBK_LOCATIONS=(
  "539e45e5-631f-46ae-a4e5-3534f1f9f501:HBK Tampa"
  "a85faae7-c610-4594-a2a6-1f9c5c612718:HBK Frisco"
  "426284b7-fd87-41e3-903b-d07203e24381:HBK Iselin"
  "2447aedf-efd5-4461-a963-c66c245e7980:HBK Lawrenceville"
  "1969b8b1-59f0-4407-9f7e-c5e1b9a7cb56:HBK Royersford"
  "9e9aa168-d236-412d-aa32-5ce73fa0693b:HBK Atlanta"
)

echo "▶ Syncing last 30 days of Maghil POS sales for all 6 HBK locations..."
echo ""

TOTAL_ROWS=0
ERRORS=0

for entry in "${HBK_LOCATIONS[@]}"; do
  LOC_ID="${entry%%:*}"
  LOC_NAME="${entry##*:}"

  printf "  %-20s ... " "$LOC_NAME"

  RESPONSE=$(curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -H "x-vercel-cron: 1" \
    -d "{\"location_id\":\"$LOC_ID\",\"days\":30}" \
    --max-time 30)

  OK=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('ok','false'))" 2>/dev/null)
  ROWS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('rows_upserted',0))" 2>/dev/null)
  ERR=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('errors',''))" 2>/dev/null)

  if [ "$OK" = "True" ] || [ "$OK" = "true" ]; then
    echo "✅  $ROWS days synced"
    TOTAL_ROWS=$((TOTAL_ROWS + ROWS))
  else
    echo "❌  $ERR"
    echo "    Raw: $RESPONSE"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""
echo "────────────────────────────────────────────"
echo "Total days upserted: $TOTAL_ROWS"
if [ $ERRORS -gt 0 ]; then
  echo "Locations with errors: $ERRORS"
fi
echo "✅ Done — data is live in CashCall dashboard"

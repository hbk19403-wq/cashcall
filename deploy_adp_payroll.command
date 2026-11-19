#!/bin/bash
# CashCall — Deploy ADP Payroll + Canonical POS Schema
# New routes: /api/payroll/adp/connect, /api/payroll/adp/callback, /api/payroll/adp/sync
# ─────────────────────────────────────────────────────────────────────────────
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"

echo "🚀 CashCall — ADP Payroll Integration Deploy"
echo "=============================================="
echo "Deploying new routes:"
echo "  • /api/payroll/adp/connect   — OAuth redirect to ADP"
echo "  • /api/payroll/adp/callback  — Token exchange + DB upsert"
echo "  • /api/payroll/adp/sync      — Daily timecard pull → labor_entries"
echo ""

TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then
  echo "❌  VERCEL_TOKEN not found in .env.local"
  echo "    Add: VERCEL_TOKEN=<your-token>"
  exit 1
fi

# Verify new route files exist
for f in \
  "src/app/api/payroll/adp/connect/route.ts" \
  "src/app/api/payroll/adp/callback/route.ts" \
  "src/app/api/payroll/adp/sync/route.ts"; do
  if [ ! -f "$f" ]; then
    echo "❌  Missing: $f"
    exit 1
  else
    echo "  ✅ Found: $f"
  fi
done
echo ""

echo "Deploying to production..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$TOKEN"
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Deploy complete!"
  echo ""
  echo "New endpoints live at cashcall.io:"
  echo "  GET  /api/payroll/adp/connect?location_id=<uuid>"
  echo "  GET  /api/payroll/adp/callback  (OAuth redirect target)"
  echo "  GET  /api/payroll/adp/sync?location_id=<uuid>"
  echo ""
  echo "Next: Add ADP_CLIENT_ID, ADP_CLIENT_SECRET, ADP_REDIRECT_URI, ADP_SANDBOX"
  echo "      to Vercel env vars (Settings → Environment Variables)."
else
  echo "❌ Deploy failed (exit $EXIT_CODE). Check the output above."
fi

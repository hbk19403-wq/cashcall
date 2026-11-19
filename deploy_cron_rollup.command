#!/bin/bash
# Deploys CashCall with updated vercel.json crons (adds Maghil nightly sync at 5am UTC)
# and the Maghil POS routes + Roll-Up dashboard
set -e
cd "$(dirname "$0")"
source .env.local

echo "▶ Deploying CashCall to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo ""
echo "✅ Done! What's new in this deploy:"
echo "   • /dashboard/rollup   — Multi-Unit Roll-Up Dashboard (accessible from nav)"
echo "   • /api/pos/maghil/*   — Maghil POS connect + sync routes"
echo "   • Nightly Maghil cron — runs at 5am UTC every day for all HBK locations"

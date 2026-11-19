#!/bin/bash
# Deploys Maghil POS integration to Vercel
# No new env vars needed — credentials are stored per-location in Supabase pos_connections
set -e
cd "$(dirname "$0")"

source .env.local

echo "▶ Deploying Maghil POS integration to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo "✅ Done — Maghil POS integration is live on cashcall.io"
echo ""
echo "   Routes added:"
echo "   POST /api/pos/maghil/connect  — save store_id + api_key for a location"
echo "   GET/POST /api/pos/maghil/sync — pull sales data from Maghil API"
echo ""
echo "   HBK locations seeded in Supabase:"
echo "   Tampa (5445456760), Royersford (5445427729), Lawrenceville (5445333493)"
echo "   Iselin (5445462621), Frisco (5445410494), Atlanta (5445437339)"

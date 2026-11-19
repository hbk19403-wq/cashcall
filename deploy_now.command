#!/bin/bash
set -e
cd "$(dirname "$0")"
source .env.local

echo "▶ Deploying CashCall fixes to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo ""
echo "✅ Deployed! Fixes:"
echo "   • Login page: Suspense wrapper for useSearchParams"
echo "   • /api/digest: force-dynamic to prevent build crash"
echo "   • Integrations page: shows all HBK + cashcall locations"

#!/bin/bash
# CashCall.io — Fix build (install stripe into lockfile) + deploy to production
set -e
cd "$(dirname "$0")"
source .env.local

echo "▶ Step 1: Installing missing packages (stripe → lockfile)..."
npm install
echo "✅ node_modules ready, package-lock.json updated"
echo ""

echo "▶ Step 2: Deploying to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo ""
echo "✅ Done! All fixes now live:"
echo "   • Build unblocked (stripe in lockfile)"
echo "   • '⚙ Integrations' link in top nav"
echo "   • Integrations page shows ALL locations (HBK + cashcall)"
echo "   • Dark theme nav throughout"

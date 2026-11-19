#!/bin/bash
# Deploys Contract Price Enforcement + GPO Aggregation features
set -e
cd "$(dirname "$0")"
source .env.local

echo "▶ Deploying CashCall to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo ""
echo "✅ Done! What's new in this deploy:"
echo "   • 📋 Contracts tab  — per-location contract prices in Food Cost > Contracts"
echo "   • 🔍 Violation check — flags invoices that exceed your negotiated contract price by >3%"
echo "   • 🔗 GPO Dashboard  — /dashboard/gpo shows cross-location price discrepancies"
echo "   • 💡 Savings calcs  — estimates 90-day and annual overpay if any location aligns to best price"

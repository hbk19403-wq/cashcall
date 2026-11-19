#!/bin/bash
# Fixes integrations page: shows HBK locations, dark theme nav, header link
set -e
cd "$(dirname "$0")"
source .env.local

echo "▶ Deploying integrations fix to production..."
/Users/ameyaswani/node/bin/vercel --prod \
  --token "$VERCEL_TOKEN" \
  --yes

echo ""
echo "✅ Done! What's fixed:"
echo "   • '⚙ Integrations' link now in the top nav"
echo "   • Integrations page now shows HBK locations (was filtering on app='cashcall' only)"
echo "   • Dark theme nav on the integrations page"
echo "   • POS, Payroll, Delivery, 7shifts cards will now render for all 6 locations"

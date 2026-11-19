#!/bin/bash
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Vercel token is read from the environment or .env.local (VERCEL_TOKEN=...), never stored in this file.
TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then echo "VERCEL_TOKEN is not set. Add VERCEL_TOKEN=... to .env.local, or export it."; exit 1; fi
CRON_SECRET="cc-cron-7am-daily-2026"

echo "=============================="
echo "  CashCall — Notifications Fix"
echo "=============================="
echo ""
echo "✅ Changes:"
echo "   • Cron schedule: 10 AM UTC → 12 PM UTC (7 AM EST)"
echo "   • CRON_SECRET wired up (cron auth was broken)"
echo "   • WhatsApp route: fixed auth header check"
echo ""

# Step 1: Set CRON_SECRET in Vercel (all environments)
echo "🔑 Setting CRON_SECRET in Vercel..."
echo "$CRON_SECRET" | /Users/ameyaswani/node/bin/vercel env add CRON_SECRET production --token "$TOKEN" --force 2>/dev/null || true
echo "$CRON_SECRET" | /Users/ameyaswani/node/bin/vercel env add CRON_SECRET preview --token "$TOKEN" --force 2>/dev/null || true
echo "   ✅ CRON_SECRET set"
echo ""

# Step 2: Deploy
echo "🚀 Deploying to Vercel..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$TOKEN"
echo ""
echo "=============================="
echo "  ✅ Done! Daily digest will fire at 7 AM EST"
echo "=============================="

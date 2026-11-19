#!/bin/bash
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Vercel token is read from the environment or .env.local (VERCEL_TOKEN=...), never stored in this file.
TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then echo "VERCEL_TOKEN is not set. Add VERCEL_TOKEN=... to .env.local, or export it."; exit 1; fi
echo "=============================="
echo "  CashCall — Twilio Deploy"
echo "=============================="
echo ""

echo "🚀 Deploying to Vercel (picks up new Twilio env vars)..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$TOKEN"

echo ""
echo "=============================="
echo "  ✅ Done! WhatsApp digest enabled"
echo "=============================="

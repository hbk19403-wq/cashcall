#!/bin/bash
cd "$(dirname "$0")"
echo "🚀 Deploying CashCall dark theme update..."
# Vercel token is read from the environment or .env.local (VERCEL_TOKEN=...), never stored in this file.
TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then echo "VERCEL_TOKEN is not set. Add VERCEL_TOKEN=... to .env.local, or export it."; exit 1; fi
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token="$TOKEN"
echo ""
echo "✅ Deploy triggered. Check cashcall.io in 2-3 minutes."

#!/bin/bash
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"

# Vercel token is read from the environment or .env.local (VERCEL_TOKEN=...), never stored in this file.
TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then echo "VERCEL_TOKEN is not set. Add VERCEL_TOKEN=... to .env.local, or export it."; exit 1; fi
echo "🚀 CashCall — CSV Import Feature Deploy"
echo "========================================"
echo "📂 sales/page.tsx — CSV Import tab"
echo "🥩 food/page.tsx  — CSV section below InvoiceOCR"
echo ""
echo "🔨 Deploying to Vercel..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$TOKEN"

echo ""
echo "✅ Done! CSV import is live at cashcall.io"
echo "   Location → Enter Sales → 📂 CSV Import tab"
echo "   Location → Food Inventory → 📂 Or import from CSV"

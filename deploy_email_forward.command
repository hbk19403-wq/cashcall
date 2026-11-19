#!/bin/bash
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
TOKEN=$(grep '^VERCEL_TOKEN=' .env.local | cut -d'=' -f2 | tr -d '[:space:]')
echo "🚀 Deploying email forwarding update..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token="$TOKEN"
echo ""
echo "✅ Done!"

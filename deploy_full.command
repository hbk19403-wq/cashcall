#!/bin/bash
export PATH="/Users/ameyaswani/node/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"

echo "🚀 CashCall Full Deploy"
echo "========================"

# Vercel token is read from the environment or .env.local (VERCEL_TOKEN=...), never stored in this file.
TOKEN="${VERCEL_TOKEN:-$(grep -s '^VERCEL_TOKEN=' "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env.local" | cut -d= -f2- | tr -d '"')}"
if [ -z "$TOKEN" ]; then echo "VERCEL_TOKEN is not set. Add VERCEL_TOKEN=... to .env.local, or export it."; exit 1; fi
# ── Check required env vars ────────────────────────────────────────────
source .env.local 2>/dev/null || true

if [ -z "$RESEND_API_KEY" ]; then
  echo ""
  echo "⚠️  RESEND_API_KEY is missing."
  echo "   Get it from: https://resend.com/api-keys"
  echo "   (Sign in → API Keys → Create API Key)"
  read -p "   Paste your RESEND_API_KEY: " RESEND_API_KEY
  if [ -n "$RESEND_API_KEY" ]; then
    echo "RESEND_API_KEY=$RESEND_API_KEY" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo ""
  echo "⚠️  SUPABASE_SERVICE_ROLE_KEY is missing."
  echo "   Get it from: https://supabase.com/dashboard/project/lhwepylnuurjbarkfugo/settings/api-keys/legacy"
  echo "   (Settings → API → service_role → Copy)"
  read -p "   Paste your SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SERVICE_ROLE_KEY
  if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

if [ -z "$STRIPE_SECRET_KEY" ]; then
  echo ""
  echo "⚠️  STRIPE_SECRET_KEY is missing."
  echo "   Get it from: https://dashboard.stripe.com/apikeys"
  read -p "   Paste your STRIPE_SECRET_KEY (sk_live_... or sk_test_...): " STRIPE_SECRET_KEY
  if [ -n "$STRIPE_SECRET_KEY" ]; then
    echo "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

if [ -z "$STRIPE_WEBHOOK_SECRET" ]; then
  echo ""
  echo "⚠️  STRIPE_WEBHOOK_SECRET is missing."
  echo "   Get it from: https://dashboard.stripe.com/webhooks"
  echo "   (Create a webhook → https://cashcall.io/api/billing/webhook → copy 'Signing secret')"
  read -p "   Paste your STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WEBHOOK_SECRET
  if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
    echo "STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

if [ -z "$STRIPE_PRICE_STARTER" ]; then
  echo ""
  echo "⚠️  STRIPE_PRICE_STARTER is missing."
  echo "   Create a \$99/mo recurring product at https://dashboard.stripe.com/products"
  read -p "   Paste the Price ID (price_...): " STRIPE_PRICE_STARTER
  if [ -n "$STRIPE_PRICE_STARTER" ]; then
    echo "STRIPE_PRICE_STARTER=$STRIPE_PRICE_STARTER" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

if [ -z "$STRIPE_PRICE_GROWTH" ]; then
  echo ""
  echo "⚠️  STRIPE_PRICE_GROWTH is missing."
  echo "   Create a \$199/mo recurring product at https://dashboard.stripe.com/products"
  read -p "   Paste the Price ID (price_...): " STRIPE_PRICE_GROWTH
  if [ -n "$STRIPE_PRICE_GROWTH" ]; then
    echo "STRIPE_PRICE_GROWTH=$STRIPE_PRICE_GROWTH" >> .env.local
    echo "   ✅ Saved to .env.local"
  fi
fi

echo ""
echo "📦 Adding keys to Vercel project..."

if [ -n "$RESEND_API_KEY" ]; then
  # Add RESEND_API_KEY to Vercel
  curl -s -X POST "https://api.vercel.com/v9/projects/prj_SjxdQhVXH0Tr6mvzlLkIRaW2wDc2/env" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"RESEND_API_KEY\",\"value\":\"$RESEND_API_KEY\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
    > /dev/null 2>&1 && echo "   ✅ RESEND_API_KEY → Vercel" || echo "   ℹ️  RESEND_API_KEY already set"
fi

if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  curl -s -X POST "https://api.vercel.com/v9/projects/prj_SjxdQhVXH0Tr6mvzlLkIRaW2wDc2/env" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"SUPABASE_SERVICE_ROLE_KEY\",\"value\":\"$SUPABASE_SERVICE_ROLE_KEY\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
    > /dev/null 2>&1 && echo "   ✅ SUPABASE_SERVICE_ROLE_KEY → Vercel" || echo "   ℹ️  SUPABASE_SERVICE_ROLE_KEY already set"
fi

for VAR in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_STARTER STRIPE_PRICE_GROWTH; do
  VAL="${!VAR}"
  if [ -n "$VAL" ]; then
    curl -s -X POST "https://api.vercel.com/v9/projects/prj_SjxdQhVXH0Tr6mvzlLkIRaW2wDc2/env" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"key\":\"$VAR\",\"value\":\"$VAL\",\"type\":\"sensitive\",\"target\":[\"production\",\"preview\"]}" \
      > /dev/null 2>&1 && echo "   ✅ $VAR → Vercel" || echo "   ℹ️  $VAR already set"
  fi
done

echo ""
echo "🔨 Deploying to Vercel..."
/Users/ameyaswani/node/bin/vercel deploy --prod --yes --token "$TOKEN"

echo ""
echo "✅ Deploy complete!"
echo "   🌐 cashcall.io/admin/clients  — Client management"
echo "   💳 cashcall.io/admin/clients  → Billing tab — Subscription tracking"
echo "   ⏰ Trial expiry enforced on all logins"

#!/bin/bash
cd "$(dirname "$0")"
echo "=== CashCall Stripe Deploy ==="

# Remove git lock if present
rm -f .git/index.lock

# Stage all changes
git add -A

# Commit
git commit -m "feat: Stripe billing integration (checkout, webhooks, portal, upgrade page)"

# Push to trigger Vercel deploy
git push

echo ""
echo "=== Done! Vercel will deploy automatically. ==="
echo "Track at: https://vercel.com/hbk-19403s-projects/cashcall"

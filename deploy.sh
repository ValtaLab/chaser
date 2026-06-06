#!/bin/bash
# deploy.sh — Build and deploy Chaser to Cloudflare Pages
set -e

cd /home/blackpi/chaser

echo "=== Building Next.js for Cloudflare Pages ==="
npx @cloudflare/next-on-pages 2>&1

echo ""
echo "=== Deploying to Cloudflare Pages ==="
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f ~/.bashrc ]; then
  export $(grep CLOUDFLARE_API_TOKEN ~/.bashrc | sed "s/export //; s/'//g")
fi

npx wrangler pages deploy .vercel/output/static --project-name=chaser 2>&1

echo ""
echo "✅ Deploy complete"

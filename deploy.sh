#!/bin/bash
# deploy.sh — Build and deploy Chaser to Cloudflare Pages, then auto-verify
set -e

cd /home/blackpi/chaser

# ========================
# Auto-bump version number in MainApp.tsx
# ========================
VERSION_FILE="src/components/MainApp.tsx"
CURRENT_VER=$(grep -o 'v[0-9]\{8\}\.[0-9]\+' "$VERSION_FILE" | head -1)
if [ -n "$CURRENT_VER" ]; then
  DATE_PART=$(echo "$CURRENT_VER" | cut -d. -f1)
  PATCH_PART=$(echo "$CURRENT_VER" | cut -d. -f2)
  NEW_PATCH=$((PATCH_PART + 1))
  NEW_VER="${DATE_PART}.${NEW_PATCH}"
  sed -i "s/$CURRENT_VER/$NEW_VER/g" "$VERSION_FILE"
  echo "✅ Version bumped: $CURRENT_VER → $NEW_VER"
else
  echo "⚠️  WARNING: Could not find version string in $VERSION_FILE — skipping auto-bump"
fi

# ========================
# Gate: browser verification required from previous deploy
# ========================
VERIFY_FILE=".browser_verify_pending"
if [ -f "$VERIFY_FILE" ]; then
  echo ""
  echo "========================================================"
  echo "🔴  BROWSER VERIFICATION PENDING FROM PREVIOUS DEPLOY"
  echo "========================================================"
  echo ""
  echo "Previous deploy hasn't been browser-verified yet."
  echo ""
  echo "Run these commands FIRST, then delete $VERIFY_FILE:"
  echo ""
  echo "  browser_navigate($(cat "$VERIFY_FILE" 2>/dev/null || echo "https://master.chaser-6ta.pages.dev"))"
  echo "  browser_console     (check for JS errors)"
  echo "  browser_vision      (check UI visually)"
  echo ""
  echo "Then: rm $VERIFY_FILE"
  echo ""
  echo "========================================================"
  exit 1
fi

# ========================
# Build
# ========================
echo ""
echo "=== Building Next.js static export ==="
npm run build 2>&1

# ========================
# Deploy
# ========================
echo ""
echo "=== Deploying to Cloudflare Pages ==="
if [ -z "$CLOUDFLARE_API_TOKEN" ] && [ -f ~/.bashrc ]; then
  export $(grep CLOUDFLARE_API_TOKEN ~/.bashrc | sed "s/export //; s/'//g")
fi

npx wrangler pages deploy out --project-name=chaser --commit-dirty=true 2>&1

# ========================
# Post-deploy verification
# ========================
echo ""
echo "=== Verifying deployment ==="
sleep 3

URL="https://master.chaser-6ta.pages.dev"

# 1. HTTP health check
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL")
if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ HTTP $HTTP_CODE — deploy verification FAILED"
  exit 1
fi
echo "✅ HTTP 200"

# 2. Content sanity check
if curl -s "$URL" | grep -q "趕車"; then
  echo "✅ Content check passed"
else
  echo "❌ Content missing (趕車 not found in HTML) — deploy verification FAILED"
  exit 1
fi

# 3. Check JS bundle can be fetched
JS_COUNT=$(curl -s "$URL" | grep -o '_next/static/chunks/[^"]*\.js' | wc -l)
echo "✅ JS bundles: $JS_COUNT files referenced"

# 4. Verify sw.js is accessible
SW_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/sw.js")
if [ "$SW_CODE" = "200" ]; then
  echo "✅ Service Worker accessible"
else
  echo "⚠️  Service Worker HTTP $SW_CODE (non-fatal)"
fi

# ========================
# Create browser verification gate
# ========================
echo "$URL" > "$VERIFY_FILE"

echo ""
echo "========================================================"
echo "✅ Deploy successful — BUT browser verification needed"
echo "========================================================"
echo ""
echo "BEFORE telling Ken:"
echo ""
echo "  1. browser_navigate($URL)"
echo "  2. browser_console"
echo "  3. browser_vision"
echo ""
echo "Then: rm $VERIFY_FILE"
echo "========================================================"

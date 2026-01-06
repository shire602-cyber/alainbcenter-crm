#!/bin/bash

# Dev Cache Reset Script
# Safely cleans Next.js build cache and regenerates dependencies

set -e

echo "🧹 Cleaning dev cache..."

# Stop any running dev server (non-blocking)
pkill -f "next dev" 2>/dev/null || true

# Clean build artifacts
echo "  Removing .next directory..."
rm -rf .next

echo "  Removing node_modules cache..."
rm -rf node_modules/.cache

# Regenerate Prisma client
echo "  Regenerating Prisma client..."
npx prisma generate

# Reinstall dependencies (optional, but ensures consistency)
read -p "  Reinstall node_modules? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  Reinstalling dependencies..."
  npm install
fi

echo "✅ Cache reset complete!"
echo "   Run: npm run dev"









#!/bin/bash
# Repair database schema - ensures all required columns exist

set -e

echo "🔧 Repairing database schema..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

echo "📦 Applying schema changes..."
npx prisma db push --skip-generate --accept-data-loss

echo "✅ Database schema repaired!"
echo "   Run 'npx prisma generate' to regenerate Prisma client"


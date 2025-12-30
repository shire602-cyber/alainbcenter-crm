#!/bin/bash
# Run all Prisma migrations on production database
# Usage: DATABASE_URL="postgresql://..." bash scripts/run-migrations.sh

set -e

echo "🔍 Checking DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable is not set"
  echo "Usage: DATABASE_URL='postgresql://...' bash scripts/run-migrations.sh"
  exit 1
fi

echo "✅ DATABASE_URL is set"
echo ""

echo "📦 Running Prisma migrations..."
npx prisma migrate deploy

echo ""
echo "✅ Migrations completed successfully"
echo ""

echo "🔍 Verifying schema..."
npx tsx scripts/db/verify-schema.ts

echo ""
echo "✅ All migrations applied and verified"


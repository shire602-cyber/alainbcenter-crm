#!/bin/bash
# Migration Rebaseline Script
# 
# This script helps create a clean Postgres migration baseline by:
# 1. Backing up existing migrations
# 2. Creating a fresh init migration from current schema
#
# Usage: ./scripts/rebaseline-migrations.sh

set -e

echo "🔄 Migration Rebaseline Script"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  echo "Please set DATABASE_URL environment variable"
  exit 1
fi

# Create backup directory
BACKUP_DIR="prisma/migrations_legacy_$(date +%Y%m%d_%H%M%S)"
echo "📦 Backing up existing migrations to: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -r prisma/migrations/* "$BACKUP_DIR/" 2>/dev/null || true
echo "✅ Backed up migrations"

# Remove old migrations (keep migration_lock.toml)
echo "🗑️  Removing old migrations..."
find prisma/migrations -mindepth 1 -maxdepth 1 -type d ! -name 'migration_lock.toml' -exec rm -rf {} + 2>/dev/null || true
echo "✅ Removed old migrations"

# Generate fresh migration from current schema
echo "🔄 Generating fresh migration from current schema..."
npx prisma migrate dev --name init_postgresql --create-only

echo ""
echo "✅ Migration rebaseline complete!"
echo ""
echo "Next steps:"
echo "1. Review the new migration in prisma/migrations/"
echo "2. Apply it: npx prisma migrate deploy"
echo "3. Seed ServiceType: npx prisma db seed"


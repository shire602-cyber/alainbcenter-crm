#!/bin/bash
# Apply Notification.snoozedUntil migration
# This script can be run manually if Prisma migrate fails

set -e

echo "🔄 Applying Notification.snoozedUntil migration..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  echo "Please set DATABASE_URL environment variable"
  exit 1
fi

# Apply migration using Prisma
echo "Running migration SQL..."
npx prisma db execute --file prisma/migrations/20251229190109_add_notification_snoozed_until/migration.sql --schema prisma/schema.prisma

echo "✅ Migration applied successfully!"

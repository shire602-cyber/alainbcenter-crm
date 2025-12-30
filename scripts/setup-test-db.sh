#!/bin/bash
# Setup test database for integration tests

set -e

echo "🔧 Setting up test database..."

# Check if TEST_DATABASE_URL is set
if [ -z "$TEST_DATABASE_URL" ]; then
  echo "⚠️  TEST_DATABASE_URL not set. Using SQLite for tests..."
  export TEST_DATABASE_URL="file:./test.db"
fi

# If using SQLite, remove old test DB
if [[ "$TEST_DATABASE_URL" == file:* ]]; then
  TEST_DB_FILE=$(echo "$TEST_DATABASE_URL" | sed 's/file://')
  if [ -f "$TEST_DB_FILE" ]; then
    echo "🗑️  Removing old test database: $TEST_DB_FILE"
    rm -f "$TEST_DB_FILE"
  fi
fi

# Run migrations or push schema
echo "📦 Applying schema to test database..."
if [[ "$TEST_DATABASE_URL" == file:* ]]; then
  # For SQLite, use db push (faster)
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss
else
  # For PostgreSQL, use migrate deploy
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
fi

echo "✅ Test database ready!"
echo "   TEST_DATABASE_URL=$TEST_DATABASE_URL"



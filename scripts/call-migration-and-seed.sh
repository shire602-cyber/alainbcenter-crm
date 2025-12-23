#!/bin/bash
# Script to apply migration and seed rules via API endpoints
# 
# Usage:
#   ./scripts/call-migration-and-seed.sh <base-url> <session-cookie>
#
# Example:
#   ./scripts/call-migration-and-seed.sh https://your-app.vercel.app "session=abc123..."

BASE_URL="${1:-http://localhost:3000}"
SESSION="${2}"

if [ -z "$SESSION" ]; then
  echo "❌ Error: Session cookie required"
  echo "Usage: $0 <base-url> <session-cookie>"
  echo "Example: $0 https://your-app.vercel.app 'session=abc123...'"
  exit 1
fi

echo "🚀 Applying migration and seeding rules..."
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Apply Migration
echo "📦 Step 1: Applying database migration..."
MIGRATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/migrate" \
  -H "Cookie: $SESSION" \
  -H "Content-Type: application/json")

if echo "$MIGRATE_RESPONSE" | grep -q '"success":true'; then
  echo "✅ Migration applied successfully"
else
  echo "❌ Migration failed:"
  echo "$MIGRATE_RESPONSE" | jq '.' 2>/dev/null || echo "$MIGRATE_RESPONSE"
  exit 1
fi

echo ""

# Step 2: Seed Info Follow-up Rules
echo "📦 Step 2: Seeding info/quotation follow-up rules..."
SEED_INFO_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/automation/seed-info-followup" \
  -H "Cookie: $SESSION" \
  -H "Content-Type: application/json")

if echo "$SEED_INFO_RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Info follow-up rules seeded successfully"
else
  echo "❌ Seeding info follow-up rules failed:"
  echo "$SEED_INFO_RESPONSE" | jq '.' 2>/dev/null || echo "$SEED_INFO_RESPONSE"
fi

echo ""

# Step 3: Seed Escalation Rules
echo "📦 Step 3: Seeding escalation rules..."
SEED_ESCALATION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/automation/seed-escalation" \
  -H "Cookie: $SESSION" \
  -H "Content-Type: application/json")

if echo "$SEED_ESCALATION_RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Escalation rules seeded successfully"
else
  echo "❌ Seeding escalation rules failed:"
  echo "$SEED_ESCALATION_RESPONSE" | jq '.' 2>/dev/null || echo "$SEED_ESCALATION_RESPONSE"
fi

echo ""
echo "🎉 Migration and seeding complete!"

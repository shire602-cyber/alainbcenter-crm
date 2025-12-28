#!/bin/bash
# Check for direct WhatsApp sends outside idempotency system
# This script ensures all outbound sends go through sendOutboundWithIdempotency()

set -e

echo "🔍 Checking for direct WhatsApp sends outside idempotency system..."
echo ""

# Allowed locations (these can use sendTextMessage directly):
ALLOWED_PATHS=(
  "src/lib/whatsapp.ts"  # Low-level sender (only used by sendWithIdempotency)
  "src/lib/outbound/sendWithIdempotency.ts"  # Idempotency wrapper (uses sendTextMessage internally)
)

# Find all direct sends
VIOLATIONS=$(grep -rn "sendTextMessage\|sendWhatsAppMessage\|graph\.facebook.*messages" src --include="*.ts" --include="*.tsx" | \
  grep -v "src/lib/whatsapp.ts" | \
  grep -v "src/lib/outbound/sendWithIdempotency.ts" | \
  grep -v "import.*sendTextMessage" | \
  grep -v "export.*sendTextMessage" | \
  grep -v "//.*sendTextMessage" || true)

if [ -z "$VIOLATIONS" ]; then
  echo "✅ No violations found! All sends go through idempotency system."
  exit 0
else
  echo "❌ VIOLATIONS FOUND: Direct sends outside idempotency system:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "⚠️  All WhatsApp sends must use sendOutboundWithIdempotency() from src/lib/outbound/sendWithIdempotency.ts"
  exit 1
fi


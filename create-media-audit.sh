#!/bin/bash
set -e

AUDIT_DIR="media-code-audit"
rm -rf "$AUDIT_DIR"
mkdir -p "$AUDIT_DIR"

# Copy all media-related API routes
mkdir -p "$AUDIT_DIR/src/app/api"
cp -r src/app/api/media "$AUDIT_DIR/src/app/api/" 2>/dev/null || true
cp -r src/app/api/webhooks/whatsapp "$AUDIT_DIR/src/app/api/webhooks/" 2>/dev/null || true
cp -r src/app/api/inbox "$AUDIT_DIR/src/app/api/" 2>/dev/null || true
cp -r src/app/api/leads "$AUDIT_DIR/src/app/api/" 2>/dev/null || true
cp -r src/app/api/upload "$AUDIT_DIR/src/app/api/" 2>/dev/null || true
mkdir -p "$AUDIT_DIR/src/app/api/admin"
cp -r src/app/api/admin/backfill-media-ids "$AUDIT_DIR/src/app/api/admin/" 2>/dev/null || true
mkdir -p "$AUDIT_DIR/src/app/api/debug"
cp -r src/app/api/debug/media "$AUDIT_DIR/src/app/api/debug/" 2>/dev/null || true

# Copy all media libraries
mkdir -p "$AUDIT_DIR/src/lib/media"
cp -r src/lib/media/* "$AUDIT_DIR/src/lib/media/" 2>/dev/null || true
cp src/lib/whatsapp-media-upload.ts "$AUDIT_DIR/src/lib/" 2>/dev/null || true
cp src/lib/whatsapp*.ts "$AUDIT_DIR/src/lib/" 2>/dev/null || true
mkdir -p "$AUDIT_DIR/src/lib/inbound"
cp src/lib/inbound/autoMatchPipeline.ts "$AUDIT_DIR/src/lib/inbound/" 2>/dev/null || true

# Copy frontend components
mkdir -p "$AUDIT_DIR/src/components/inbox"
cp src/components/inbox/MediaMessage.tsx "$AUDIT_DIR/src/components/inbox/" 2>/dev/null || true
cp src/components/inbox/AudioMessagePlayer.tsx "$AUDIT_DIR/src/components/inbox/" 2>/dev/null || true
mkdir -p "$AUDIT_DIR/src/app/inbox"
cp src/app/inbox/page.tsx "$AUDIT_DIR/src/app/inbox/" 2>/dev/null || true
mkdir -p "$AUDIT_DIR/src/components/leads"
cp src/components/leads/ConversationWorkspace.tsx "$AUDIT_DIR/src/components/leads/" 2>/dev/null || true

# Copy scripts
mkdir -p "$AUDIT_DIR/scripts"
cp scripts/*media*.ts "$AUDIT_DIR/scripts/" 2>/dev/null || true
cp scripts/*whatsapp*.ts "$AUDIT_DIR/scripts/" 2>/dev/null || true

# Copy tests
mkdir -p "$AUDIT_DIR/e2e"
cp e2e/*media*.spec.ts "$AUDIT_DIR/e2e/" 2>/dev/null || true

# Create README
cat > "$AUDIT_DIR/README.md" << 'EOF'
# Media Code Audit - Complete Codebase

This archive contains ALL code related to:
- Media handling (images, PDFs, audio, video)
- WhatsApp media integration
- Media proxy and storage
- Media recovery mechanisms
- Frontend media components

## Current Issue Status

**CONFIRMED NOT WORKING:**
- Recent media messages (ID 2381+) have:
  - providerMediaId: NULL
  - mediaUrl: NULL
  - rawPayload: NULL
  - payload: NULL
- All recovery mechanisms fail because no data is stored
- Frontend shows "[Media message]" placeholders

## File Structure

See individual files for complete code.

## Key Files

1. **Webhook**: `src/app/api/webhooks/whatsapp/route.ts` - Extracts media from webhook
2. **Pipeline**: `src/lib/inbound/autoMatchPipeline.ts` - Stores media in DB
3. **Proxy**: `src/app/api/media/messages/[id]/route.ts` - Fetches media from WhatsApp
4. **Frontend**: `src/app/inbox/page.tsx` - Renders media messages
EOF

echo "Created audit directory with $(find $AUDIT_DIR -type f | wc -l) files"

# WhatsApp Media Archive Contents

This archive contains all files related to WhatsApp media handling (both inbound and outbound).

## Source Code Files

### API Routes
- `src/app/api/media/messages/[id]/route.ts` - Media proxy route (handles media download)
- `src/app/api/webhooks/whatsapp/route.ts` - Inbound WhatsApp webhook handler (processes incoming media)
- `src/app/api/inbox/conversations/[id]/route.ts` - Inbox conversation API (media detection logic)
- `src/app/api/inbox/conversations/[id]/messages/route.ts` - Outbound message sending (media upload)

### Library Functions
- `src/lib/media/whatsappMedia.ts` - WhatsApp media helper functions (fetching, streaming)
- `src/lib/media/extractMediaId.ts` - Media ID extraction logic (detectMediaType, extractMediaInfo)
- `src/lib/media/__tests__/extractMediaId.test.ts` - Unit tests for media extraction
- `src/lib/whatsapp-media-upload.ts` - Media upload to Meta Graph API
- `src/lib/whatsapp.ts` - Unified WhatsApp credentials helper
- `src/lib/inbound/autoMatchPipeline.ts` - Inbound message processing pipeline (stores media metadata)

### UI Components
- `src/app/inbox/page.tsx` - Inbox UI (media rendering logic)
- `src/components/inbox/MediaMessage.tsx` - Media message component (renders images/videos/documents)
- `src/components/inbox/AudioMessagePlayer.tsx` - Audio player component

## Documentation Files

- `MEDIA_RENDERING_DIAGNOSIS.md` - Initial audit and diagnosis
- `WHATSAPP_CREDENTIALS_UNIFIED.md` - Unified credentials system documentation
- `MEDIA_RENDERING_RELIABILITY.md` - Media reliability improvements
- `MEDIA_RENDERING_RELIABILITY_IMPLEMENTATION.md` - Implementation details
- `MEDIA_PROXY_GATE_FIX.md` - Media proxy gate logic fix
- `INBOX_MEDIA_CANONICAL_FIX.md` - Inbox media detection fix
- `INBOUND_MEDIA_FINAL_FIX.md` - Inbound media classification fix

## Key Features

### Inbound Media Flow
1. Webhook receives message → `src/app/api/webhooks/whatsapp/route.ts`
2. Extracts media info → `src/lib/media/extractMediaId.ts`
3. Stores in DB → `src/lib/inbound/autoMatchPipeline.ts`
4. Renders in inbox → `src/app/inbox/page.tsx` → `src/components/inbox/MediaMessage.tsx`
5. Fetches media → `src/app/api/media/messages/[id]/route.ts` → `src/lib/media/whatsappMedia.ts`

### Outbound Media Flow
1. User sends media → `src/app/api/inbox/conversations/[id]/messages/route.ts`
2. Uploads to Meta → `src/lib/whatsapp-media-upload.ts`
3. Stores message → Database with providerMediaId
4. Renders in inbox → Same as inbound

### Credentials
- Single source of truth → `src/lib/whatsapp.ts` (getWhatsAppCredentials)
- Used by both upload and download paths

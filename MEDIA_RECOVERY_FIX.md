# Media Recovery Fix - ExternalEventLog Support

## Issue
Media messages were showing error: "This media was received before metadata capture was enabled. Ask customer to resend or upload to Documents."

This error (HTTP 424) occurs when the media proxy cannot resolve the `providerMediaId` from:
- PRIORITY A: `message.providerMediaId` (canonical field)
- PRIORITY B: `message.mediaUrl` (backward compatibility)
- PRIORITY C: `message.payload` or `message.rawPayload` (recovery)

## Solution
Added **PRIORITY D: ExternalEventLog recovery** as a last resort for old messages.

### How It Works
1. When a media message is received via webhook, the full payload is stored in `ExternalEventLog`
2. The stored payload contains the original webhook structure with media IDs
3. When media proxy cannot find media ID in the message record, it queries `ExternalEventLog`
4. It searches for entries where:
   - `provider: 'whatsapp'`
   - `payload` contains the `providerMessageId`
5. Extracts media ID from stored webhook structure:
   - From stored format: `{ messageId, message: { audio: { id }, image: { id }, ... } }`
   - From webhook structure: `entry[0].changes[0].value.messages[0].{type}.id`

### Files Modified
- `src/app/api/media/messages/[id]/route.ts`
  - Made `resolveMediaSource` async
  - Added PRIORITY D: ExternalEventLog query
  - Enhanced payload parsing to handle both stored and webhook formats

### Benefits
- **Recovers media for old messages** that were stored before `providerMediaId` field was added
- **Works even if `rawPayload` is missing** or corrupted
- **No data migration needed** - uses existing webhook logs
- **Backward compatible** - only used as last resort

### Testing
To test if recovery works:
1. Find a message showing the 424 error
2. Check server logs for `[MEDIA-RESOLVE]` entries
3. Should see "Found media ID in ExternalEventLog (PRIORITY D)" if recovery succeeds

### Limitations
- Only works if webhook payload was stored in ExternalEventLog
- Requires `providerMessageId` to match stored webhook entry
- May be slower for old messages (database query)









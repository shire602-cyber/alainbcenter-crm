# Messaging Schema Analysis & Refactor Plan

## Current State

### ✅ Already Exists & Working

1. **Conversation Model** (lines 169-203)
   - ✅ Has `contact`, `lead` relations
   - ✅ Has `channel` field (String - SQLite compatible)
   - ✅ Has `externalThreadId` and `waConversationId` for WhatsApp
   - ✅ Has `status`, `lastMessageAt`, `unreadCount`, `assignedUserId`
   - ✅ Has proper indexes and unique constraints
   - ⚠️ Missing: Generic `externalId` field (currently WhatsApp-specific)

2. **Message Model** (lines 205-234)
   - ✅ Has `conversation`, `lead`, `contact` relations
   - ✅ Has `direction`, `channel`, `type`, `body`, `status`
   - ✅ Has `mediaUrl`, `mediaMimeType` for media support
   - ✅ Has `providerMessageId` (unique) for deduplication
   - ✅ Has `rawPayload` for webhook debugging
   - ✅ Has `sentAt`, `deliveredAt`, `readAt` timestamps (via status events)
   - ⚠️ Uses "IN" | "OUT" instead of "INBOUND" | "OUTBOUND"
   - ⚠️ `meta` is String? instead of Json? (SQLite limitation, but we can parse)

3. **MessageStatusEvent Model** (lines 471-486)
   - ✅ Tracks status changes (RECEIVED | SENT | DELIVERED | READ | FAILED)
   - ✅ Stores provider status and error messages
   - ✅ Properly indexed

### 🔄 Needs Refactoring

1. **Direction Values**
   - Current: "IN" | "OUT"
   - Required: "INBOUND" | "OUTBOUND"
   - Impact: Low - just string values, easy to migrate

2. **Conversation.externalId**
   - Current: Has `externalThreadId` (legacy) and `waConversationId` (WhatsApp-specific)
   - Required: Generic `externalId` for all channels
   - Action: Add `externalId` field, keep existing fields for backward compatibility

3. **Message.payload**
   - Current: Has `meta` (String? - JSON stored as string) and `rawPayload` (String? - full webhook)
   - Required: `payload` Json? field
   - Action: Keep existing fields, add `payload` Json? field (will be stored as String in SQLite)

## Refactor Plan

### Step 1: Schema Updates

1. Add `externalId` to Conversation model
2. Add `payload` Json? to Message model (optional - can use existing fields)
3. **Decision**: Keep direction as "IN"/"OUT" for now (less breaking change) OR migrate to "INBOUND"/"OUTBOUND"
   - Recommendation: Keep current values, document in comments

### Step 2: Migration Strategy

- Add new fields as nullable
- Backfill data if needed
- Update webhook handlers to use new fields

### Step 3: Code Updates

- Update webhook handlers to use standard field names
- Update send functions to use Conversation.externalId
- Ensure all code uses Message.direction consistently

## Decision: Keep Current Schema (Minimal Changes)

After analysis, the current schema is **well-designed and production-ready**. Minor adjustments:

1. ✅ Add `externalId` to Conversation for multi-channel support
2. ✅ Document enum values clearly in schema comments
3. ✅ Keep "IN"/"OUT" for direction (can add "INBOUND"/"OUTBOUND" as alias in code)

The schema already supports:
- Multi-channel messaging
- Proper deduplication
- Status tracking
- Media messages
- Agent assignment
- Threading (via Conversation)

**No breaking changes needed** - current implementation is solid.



















# CRM Reliability Fixes - Implementation Status

## Overview
This document tracks the implementation of core CRM reliability fixes to eliminate duplicate contacts, conversations, and messages.

## Step 1: Contact Normalization ✅ IN PROGRESS

### Completed:
- ✅ Added `phoneNormalized` and `waId` fields to Contact model
- ✅ Created migration file
- ✅ Installed `libphonenumber-js` package
- ✅ Created `normalizePhone()` helper using libphonenumber-js
- ✅ Created `upsertContact()` function with priority: waId > phoneNormalized > phone
- ✅ Updated `autoMatchPipeline.ts` to use new upsert logic

### Pending:
- ⏳ Update all inbound processors to use upsertContact
- ⏳ Update all outbound send flows to use upsertContact
- ⏳ Create backfill migration to normalize existing contacts
- ⏳ Merge duplicate contacts

## Step 2: Single Message Table ⏳ PENDING

### Tasks:
- [ ] Audit all ChatMessage usage
- [ ] Migrate ChatMessage data to Message table
- [ ] Update all UI/API to use Message only
- [ ] Add unique constraint on (channel, providerMessageId)

## Step 3: Conversation Routing ⏳ PENDING

### Tasks:
- [ ] Ensure all conversation creation uses upsert
- [ ] Fix inbox query to group by conversationId
- [ ] Ensure all messages attach to same conversationId

## Step 4: Lead Auto-fill ⏳ PENDING

### Tasks:
- [ ] Create ServiceType model with synonyms
- [ ] Implement service synonym matching
- [ ] Update field extractors to use synonym matching
- [ ] Auto-update lead.serviceTypeId within 2 seconds

## Step 5: Outbound Idempotency ⏳ PENDING

### Tasks:
- [ ] Add outboundHash calculation
- [ ] Create OutboundGuard table or add to Message
- [ ] Check hash before sending
- [ ] Add rate limiting (max 1 per 2 seconds)

## Step 6: AI Script Enforcement ⏳ PENDING

### Tasks:
- [ ] Change AI output to strict JSON
- [ ] Implement repeat-question guard
- [ ] Track askedQuestions in conversation metadata
- [ ] Prevent asking same question if already answered

## Step 7: Tests ⏳ PENDING

### Tasks:
- [ ] Unit test: normalizePhone()
- [ ] Integration test: duplicate webhook handling
- [ ] Integration test: inbound/outbound same conversation
- [ ] Integration test: service extraction
- [ ] Integration test: outbound idempotency

## Files Modified

1. `prisma/schema.prisma` - Added phoneNormalized and waId
2. `src/lib/phone/normalize.ts` - New phone normalization helper
3. `src/lib/contact/upsert.ts` - New contact upsert logic
4. `src/lib/inbound/autoMatchPipeline.ts` - Updated to use upsertContact
5. `src/app/api/webhooks/whatsapp/route.ts` - Pass webhook payload for waId

## Next Steps

1. Complete Step 1: Update all contact creation points
2. Create backfill script for existing contacts
3. Implement Step 2: Remove ChatMessage usage
4. Implement Step 4: Service synonym matching
5. Implement Step 5: Outbound idempotency
6. Implement Step 6: AI script enforcement
7. Write comprehensive tests


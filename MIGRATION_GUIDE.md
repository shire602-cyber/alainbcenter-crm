# Migration Guide: Single Contact/Conversation/Lead System

## Overview
This migration implements a reliable "single contact per phone / single conversation per contact+channel / auto-filled lead" system and eliminates duplicate inbox threads and missing lead field population.

## Changes Summary

### Database Schema Changes
1. **Added `businessActivityRaw` field to Lead model**
   - Type: `String?`
   - Purpose: Store raw business activity mentioned by customer (e.g., "marketing license") immediately without questioning

2. **Existing Constraints (Verified)**
   - `Contact.phoneNormalized` - Already has `@unique` constraint
   - `Conversation.contactId_channel` - Already has `@@unique([contactId, channel])` constraint

### Code Changes

#### 1. Phone Normalization & Uniqueness (STEP 2)
- **File**: `src/lib/contact/upsert.ts` (already exists)
- **Behavior**: All contact creation/updates use `upsertContact` which normalizes phone to E.164 format
- **Constraint**: `phoneNormalized` is unique at DB level

#### 2. Conversation Uniqueness (STEP 3)
- **File**: `src/lib/inbound/autoMatchPipeline.ts`
- **Change**: `findOrCreateConversation` now uses `prisma.conversation.upsert` with `contactId_channel` unique constraint
- **Behavior**: Ensures one conversation per (contactId, channel) - prevents duplicates at DB level
- **Channel Format**: Uses lowercase for consistency (`whatsapp`, `email`, etc.)

#### 3. Lead Auto-fill (STEP 4)
- **Files**: 
  - `src/lib/inbound/serviceDetection.ts` (new)
  - `src/lib/inbound/autoMatchPipeline.ts` (updated)
  - `src/lib/inbound/fieldExtractors.ts` (updated)
- **Behavior**:
  - Service detection uses `services.seed.json` for comprehensive synonym matching
  - `serviceTypeEnum` is set IMMEDIATELY when service is detected
  - `businessActivityRaw` is extracted and stored IMMEDIATELY for business_setup services
  - `expiryDate` is set IMMEDIATELY when explicit date is extracted
  - All updates happen in a single database operation

#### 4. Services Seed JSON (STEP 7)
- **File**: `config/services.seed.json` (new)
- **Purpose**: Centralized service definitions with synonyms, default questions, max questions, and special offers
- **Usage**: Loaded by `serviceDetection.ts` for service matching

#### 5. Outbound Dedupe (STEP 5)
- **File**: `src/lib/outbound/idempotency.ts` (already exists)
- **Behavior**: Prevents duplicate outbound messages using idempotency keys

#### 6. Merge Script (STEP 6)
- **File**: `scripts/merge-contacts.ts` (new)
- **Purpose**: Backfills `phoneNormalized`, merges duplicate contacts, and consolidates conversations
- **Usage**: `DRY_RUN=true npx tsx scripts/merge-contacts.ts` (preview) or `DRY_RUN=false npx tsx scripts/merge-contacts.ts` (execute)

## Migration Steps

### Step 1: Backup Database
```bash
# PostgreSQL
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Or use your preferred backup method
```

### Step 2: Deploy Code
```bash
# Pull latest code
git pull origin main

# Install dependencies (if needed)
npm install

# Generate Prisma client
npx prisma generate
```

### Step 3: Run Prisma Migration
```bash
# Create migration for businessActivityRaw field
npx prisma migrate dev --name add_business_activity_raw

# Or apply existing migration
npx prisma migrate deploy
```

### Step 4: Backfill & Merge (DRY RUN)
```bash
# Preview changes (safe - no modifications)
DRY_RUN=true npx tsx scripts/merge-contacts.ts
```

Review the output to see:
- How many contacts will be backfilled
- How many duplicate contacts will be merged
- How many duplicate conversations will be merged

### Step 5: Execute Merge
```bash
# Execute merge (modifies database)
DRY_RUN=false npx tsx scripts/merge-contacts.ts
```

### Step 6: Verify Constraints
```bash
# Verify unique constraints are in place
npx prisma db execute --stdin <<EOF
SELECT 
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'Contact'::regclass OR conrelid = 'Conversation'::regclass;
EOF
```

Expected constraints:
- `Contact_phoneNormalized_key` (unique on phoneNormalized)
- `Conversation_contactId_channel_key` (unique on contactId + channel)

### Step 7: Test
1. Send a test inbound message
2. Verify:
   - One contact is created/found
   - One conversation is created/found
   - Lead fields are auto-filled immediately (serviceTypeEnum, businessActivityRaw if applicable, expiryDate if applicable)
3. Send a reply (outbound)
4. Verify:
   - Reply is in the same conversation thread
   - No duplicate conversations appear in inbox

## Rollback Plan

If issues occur:

### 1. Remove Constraints (if needed)
```sql
-- Remove unique constraint on phoneNormalized (if causing issues)
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_phoneNormalized_key";

-- Remove unique constraint on conversation (if causing issues)
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_contactId_channel_key";
```

### 2. Restore Database Backup
```bash
# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
```

### 3. Revert Code
```bash
# Revert to previous commit
git revert HEAD
# Or checkout previous version
git checkout <previous-commit-hash>
```

## Testing Checklist

- [ ] Inbound message creates one contact (normalized phone)
- [ ] Inbound message creates one conversation (contact+channel)
- [ ] Second inbound from same phone uses existing contact
- [ ] Second inbound from same contact+channel uses existing conversation
- [ ] Service detection sets `serviceTypeEnum` immediately
- [ ] Business activity extraction sets `businessActivityRaw` immediately
- [ ] Explicit date extraction sets `expiryDate` immediately
- [ ] Outbound reply attaches to same conversation
- [ ] Inbox shows one thread per contact+channel
- [ ] Lead page displays auto-filled fields immediately
- [ ] No duplicate messages are sent (idempotency works)

## Files Changed

### New Files
- `config/services.seed.json` - Service definitions with synonyms
- `src/lib/inbound/serviceDetection.ts` - Enhanced service detection
- `scripts/merge-contacts.ts` - Merge/backfill script
- `MIGRATION_GUIDE.md` - This file

### Modified Files
- `prisma/schema.prisma` - Added `businessActivityRaw` field
- `src/lib/inbound/autoMatchPipeline.ts` - Enhanced extraction, conversation upsert
- `src/lib/inbound/fieldExtractors.ts` - Added `extractExplicitDate` helper
- `src/components/leads/ExtractedDataPanel.tsx` - Display businessActivityRaw and expiryDate
- `src/app/leads/[id]/LeadDetailPagePremium.tsx` - Pass businessActivityRaw and expiryDate to ExtractedDataPanel

## Support

If you encounter issues:
1. Check logs for errors
2. Verify database constraints are in place
3. Run merge script in DRY_RUN mode to identify issues
4. Review the "Testing Checklist" above


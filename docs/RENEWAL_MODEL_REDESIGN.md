# Renewal Model Redesign - Phase A

## Overview

Redesigned the Renewal system with a first-class `Renewal` model linked to Lead, supporting multiple renewals per lead.

## Data Model Changes

### New Renewal Model

The `Renewal` model is now:
- **First-class**: Directly linked to `Lead` (required `leadId`)
- **Multiple renewals per lead**: One lead can have multiple renewal records
- **Simplified structure**: Focused on core renewal lifecycle

### Schema Structure

```prisma
enum RenewalType {
  TRADE_LICENSE
  EMIRATES_ID
  RESIDENCY
  VISIT_VISA
}

enum RenewalStatus {
  ACTIVE
  CONTACTED
  IN_PROGRESS
  RENEWED
  EXPIRED
  LOST
}

model Renewal {
  id              Int           @id @default(autoincrement())
  lead            Lead          @relation(fields: [leadId], references: [id])
  leadId          Int           // Required - first-class link to Lead
  type            RenewalType
  expiryDate      DateTime
  status          RenewalStatus @default(ACTIVE)
  estimatedValue  Int?          // Estimated renewal value in AED
  assignedUserId  Int?
  assignedUser    User?         @relation("AssignedRenewals", ...)
  lastContactedAt DateTime?
  nextFollowUpAt  DateTime?
  notes           String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  notifications   RenewalNotification[]

  @@index([leadId, expiryDate])
  @@index([status, expiryDate])
  @@index([assignedUserId, status, expiryDate])
  @@index([expiryDate])
}
```

### Key Changes

1. **Removed Contact dependency**: Renewal is now linked directly to Lead only
2. **Removed Conversation dependency**: No longer requires conversation
3. **Simplified status lifecycle**: 6 clear states (ACTIVE → CONTACTED → IN_PROGRESS → RENEWED/EXPIRED/LOST)
4. **Added estimatedValue**: Revenue tracking in AED
5. **Added nextFollowUpAt**: Follow-up scheduling
6. **Removed reminder fields**: Reminder logic moved to separate system

### Enum Conflicts Resolved

- `RenewalStatus` (for Renewal model): ACTIVE, CONTACTED, IN_PROGRESS, RENEWED, EXPIRED, LOST
- `RenewalItemStatus` (for RenewalItem model): UPCOMING, ACTION_REQUIRED, URGENT, EXPIRED, CONTACTED, QUOTED, IN_PROGRESS, RENEWED, LOST

## Expiry Classification Helpers

New helper functions in `src/lib/renewals/classification.ts`:

### Functions

- `classifyExpiry(expiryDate, now?)`: Returns classification with days remaining, label, and color
- `isUrgent(expiryDate, now?)`: Returns true if <= 14 days remaining
- `isWarning(expiryDate, now?)`: Returns true if 15-30 days remaining
- `isEarly(expiryDate, now?)`: Returns true if 31-90 days remaining
- `isExpired(expiryDate, now?)`: Returns true if already expired
- `getExpiryPriority(expiryDate, now?)`: Returns priority score for sorting (lower = higher priority)

### Classification Rules

- **urgent**: <= 14 days remaining (red)
- **warning**: 15-30 days remaining (orange)
- **early**: 31-90 days remaining (blue)
- **expired**: < 0 days (red)

## Migration Utilities

Migration helpers in `src/lib/renewals/migration.ts`:

### Functions

- `migrateExpiryItemsToRenewals()`: Migrates ExpiryItem records to Renewal model
- `migrateRenewalItemsToRenewals()`: Migrates RenewalItem records to Renewal model

### Migration Mapping

**ExpiryItem → Renewal:**
- `type` → `RenewalType` (TRADE_LICENSE_EXPIRY → TRADE_LICENSE, etc.)
- `renewalStatus` → `RenewalStatus` (NOT_STARTED → ACTIVE, etc.)
- `expiryDate` → `expiryDate`
- `assignedUserId` → `assignedUserId`
- `lastReminderSentAt` → `lastContactedAt`

**RenewalItem → Renewal:**
- `serviceType` → `type` (direct mapping)
- `status` → `RenewalStatus` (UPCOMING → ACTIVE, etc.)
- `expiresAt` → `expiryDate`
- `expectedValue` → `estimatedValue`
- `assignedToUserId` → `assignedUserId`
- `lastContactedAt` → `lastContactedAt`
- `nextActionAt` → `nextFollowUpAt`

## Status Lifecycle

```
ACTIVE → CONTACTED → IN_PROGRESS → RENEWED
                              ↓
                           EXPIRED
                              ↓
                            LOST
```

### Status Descriptions

- **ACTIVE**: Newly created, not yet contacted
- **CONTACTED**: Initial outreach completed
- **IN_PROGRESS**: Renewal process started (quoted, documents submitted, etc.)
- **RENEWED**: Successfully renewed
- **EXPIRED**: Expiry date passed, not renewed
- **LOST**: Customer declined or not renewing

## Database Migration

Migration file: `prisma/migrations/20250116000000_redesign_renewal_model/migration.sql`

### Steps

1. Rename existing `RenewalStatus` enum to `RenewalItemStatus`
2. Create new `RenewalType` enum
3. Create new `RenewalStatus` enum
4. Update `RenewalItem` to use `RenewalItemStatus`
5. Drop old `Renewal` columns (contactId, conversationId, reminder fields)
6. Add new columns (type, estimatedValue, assignedUserId, lastContactedAt, nextFollowUpAt, notes)
7. Update status column to use new enum
8. Make `leadId` required
9. Recreate indexes
10. Update foreign key constraints

## Next Steps (Phase B+)

- [ ] Update API routes to use new Renewal model
- [ ] Update UI to display Renewal records
- [ ] Migrate existing data using migration utilities
- [ ] Update renewal engine to use new model
- [ ] Add renewal creation/editing UI

## Notes

- **No UI changes in Phase A**: This phase focuses on data model and logic only
- **Backward compatibility**: Existing `RenewalItem` model remains for now
- **Migration is optional**: Can run migration utilities when ready to migrate data


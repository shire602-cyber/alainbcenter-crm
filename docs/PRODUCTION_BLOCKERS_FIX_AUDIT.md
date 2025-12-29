# Production Blockers Fix - Audit Report

## Summary
Fixed 3 critical production blockers:
1. **Delete Chat** - Implemented soft delete to prevent FK constraint violations
2. **Lead Page Routing** - Added fallback resolution and helpful empty states
3. **Visual Baseline** - Established consistent theme system and removed panic red UI

---

## Phase B: Fix 1 - Delete Chat Soft Delete

### Bug
- **Issue**: Hard delete of conversations caused FK constraint violations when related records (OutboundJob, Message, Task, etc.) still referenced the conversation
- **Root Cause**: `DELETE /api/admin/conversations/[id]/delete` used `prisma.conversation.delete()` which attempted to delete the conversation while foreign keys still referenced it

### Fix
- **Files Changed**:
  1. `prisma/schema.prisma` - Added `deletedAt DateTime?` field to Conversation model
  2. `prisma/migrations/20250130000000_add_conversation_soft_delete/migration.sql` - Migration to add column
  3. `src/app/api/admin/conversations/[id]/delete/route.ts` - Changed from hard delete to soft delete (sets `deletedAt = now()` and `status = 'deleted'`)
  4. `src/app/api/admin/conversations/[id]/restore/route.ts` - New endpoint to restore archived conversations
  5. `src/app/api/inbox/conversations/route.ts` - Updated to exclude `deletedAt != null` conversations
  6. `src/app/api/inbox/refresh-intelligence/route.ts` - Updated to exclude deleted conversations
  7. `src/app/api/inbox/conversations/[id]/route.ts` - Added `isArchived` flag in response

### How to Verify
1. Open Inbox, select a conversation
2. Click "Delete Chat" (admin only)
3. **Expected**: Conversation disappears from inbox list
4. **Expected**: No FK constraint errors in console
5. **Expected**: Conversation still exists in DB with `deletedAt` set
6. **Expected**: Related records (OutboundJob, Messages, Tasks) still exist

### Regression Test
```typescript
// Create conversation with OutboundJob
const conv = await prisma.conversation.create({...})
const job = await prisma.outboundJob.create({
  conversationId: conv.id,
  ...
})

// Soft delete
await fetch(`/api/admin/conversations/${conv.id}/delete`, { method: 'DELETE' })

// Assert: conversation exists with deletedAt
const deleted = await prisma.conversation.findUnique({ where: { id: conv.id } })
assert(deleted.deletedAt !== null)

// Assert: outbound job still exists
const jobStillExists = await prisma.outboundJob.findUnique({ where: { id: job.id } })
assert(jobStillExists !== null)
```

---

## Phase C: Fix 2 - Lead Page Routing + Fallback

### Bug
- **Issue**: Navigating to `/leads/[id]` with invalid or missing leadId resulted in blank page or dead end
- **Root Cause**: No fallback resolution when leadId doesn't exist; no helpful empty state

### Fix
- **Files Changed**:
  1. `src/app/api/leads/[id]/route.ts` - Added fallback resolution logic:
     - If lead not found, try to find via `conversationId` query param
     - If conversation found, use its `leadId`
     - If no leadId on conversation, find latest lead by `contactId`
     - Return redirect hint (`_redirect`) if fallback succeeds
  2. `src/app/leads/[id]/page.tsx` - Enhanced empty state:
     - Shows helpful message with icon
     - Action buttons: "Back to Leads", "Open Inbox Conversation" (if conversationId available), "Create New Lead" (if contactId available)
     - Handles redirect hints from API

### How to Verify
1. Navigate to `/leads/99999` (non-existent lead)
   - **Expected**: Shows helpful empty state with "Back to Leads" button
2. Navigate to `/leads/99999?conversationId=123` (where conversation 123 has a leadId)
   - **Expected**: Automatically redirects to correct lead page
3. Navigate to `/leads/99999?conversationId=123` (where conversation 123 has no leadId but has contactId)
   - **Expected**: Redirects to latest lead for that contact
4. Navigate to `/leads/99999?contactId=456`
   - **Expected**: Redirects to latest lead for contact 456

---

## Phase D: Fix 3 - Visual Baseline Cleanup

### Bug
- **Issue**: Inconsistent theming, red panic backgrounds, poor contrast, no logo
- **Root Cause**: No centralized theme system, ad-hoc color usage

### Fix
- **Files Changed**:
  1. `src/app/globals.css` - Added CSS variables for theme system:
     - `--bg-app`, `--bg-card`, `--bg-card-muted`
     - `--text`, `--text-muted`
     - `--border`, `--shadow-soft`, `--shadow-premium`
     - `--spacing-xs` through `--spacing-xl`
     - Dark mode variants
  2. `src/components/layout/Sidebar.tsx` - Added logo:
     - Logo image at `/brand/alain-logo.webp`
     - Fallback to "A" text if image fails
     - "Alain CRM" text next to logo
  3. Red backgrounds removed (kept only for badges/dots):
     - `src/components/leads/LeadDNA.tsx` - Red only in badges
     - `src/components/leads/NextBestActionPanel.tsx` - Red only in task status dots
     - `src/components/leads/ActionCockpitCard.tsx` - Red only in badges

### How to Verify
1. Open dashboard
   - **Expected**: Logo visible in sidebar header
   - **Expected**: Consistent spacing (16/24/32px rhythm)
   - **Expected**: Cards have subtle shadows, rounded corners
   - **Expected**: No red background blocks (only red badges/dots)
2. Open lead page
   - **Expected**: Good contrast between app background and cards
   - **Expected**: Premium feel with proper spacing
3. Check dark mode
   - **Expected**: Logo and text readable
   - **Expected**: Theme variables work correctly

---

## Files Changed Summary

### Schema & Migrations
- `prisma/schema.prisma` - Added `deletedAt` field
- `prisma/migrations/20250130000000_add_conversation_soft_delete/migration.sql` - Migration

### API Routes
- `src/app/api/admin/conversations/[id]/delete/route.ts` - Soft delete
- `src/app/api/admin/conversations/[id]/restore/route.ts` - Restore (new)
- `src/app/api/inbox/conversations/route.ts` - Exclude deleted
- `src/app/api/inbox/refresh-intelligence/route.ts` - Exclude deleted
- `src/app/api/inbox/conversations/[id]/route.ts` - Added isArchived flag
- `src/app/api/leads/[id]/route.ts` - Fallback resolution

### UI Components
- `src/app/leads/[id]/page.tsx` - Enhanced empty state, fallback handling
- `src/components/layout/Sidebar.tsx` - Added logo
- `src/app/globals.css` - Theme system CSS variables

### Assets
- `public/brand/alain-logo.webp` - Logo image

---

## Build Status
✅ `npm run build` - **PASSING**

## Manual QA Checklist

### Delete Chat
- [ ] Delete conversation from inbox
- [ ] Verify no FK errors
- [ ] Verify conversation hidden from inbox
- [ ] Verify conversation still in DB with deletedAt
- [ ] Verify restore endpoint works (optional)

### Lead Page Routing
- [ ] Navigate to non-existent lead → shows empty state
- [ ] Navigate with conversationId → redirects correctly
- [ ] Navigate with contactId → redirects correctly
- [ ] Empty state shows helpful buttons

### Visual Baseline
- [ ] Logo visible in sidebar
- [ ] Consistent spacing throughout
- [ ] No red background blocks
- [ ] Good contrast (app vs cards)
- [ ] Dark mode works correctly

---

## Notes
- Soft delete preserves data integrity while hiding conversations from UI
- Fallback resolution prevents dead ends and improves UX
- Theme system provides foundation for consistent design
- All changes are backward compatible (no breaking changes)


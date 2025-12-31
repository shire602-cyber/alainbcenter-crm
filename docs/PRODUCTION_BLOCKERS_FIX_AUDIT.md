# Production Blockers Fix - Audit & QA Checklist

**Date:** 2025-12-31  
**Status:** ✅ Complete  
**Build:** `npm run build` passes

---

## Summary

Fixed 3 production blockers:
1. ✅ **Delete Chat FK Error** - Implemented soft delete (idempotent)
2. ✅ **Lead Page Not Found** - Enhanced fallback resolution
3. ✅ **Visual Baseline** - Premium theme tokens, logo, spacing

---

## PHASE 1: Delete Chat Soft Delete

### What Changed

**Files Modified:**
- `src/app/api/admin/conversations/[id]/delete/route.ts` - Made idempotent (returns success if already deleted)
- `src/app/api/leads/[id]/route.ts` - Added `deletedAt: null` filter to conversations query
- `src/app/api/inbox/conversations/route.ts` - Already filters `deletedAt: null` ✅
- `src/app/api/inbox/refresh-intelligence/route.ts` - Already filters `deletedAt: null` ✅

**Migration:**
- `prisma/migrations/20251230122512_fix_schema_drift_deleted_at_snoozed_until/migration.sql` - Already exists ✅
- `Conversation.deletedAt` column exists in schema ✅

**Restore Endpoint:**
- `src/app/api/admin/conversations/[id]/restore/route.ts` - Already exists ✅

### Why FK Error Cannot Happen Anymore

1. **Soft Delete Only:** Delete endpoint sets `deletedAt` timestamp instead of hard deleting
2. **Idempotent:** Calling delete on already-deleted conversation returns success (no error)
3. **All Queries Filter:** Inbox queries exclude `deletedAt IS NOT NULL` conversations
4. **FK Integrity Preserved:** All foreign keys (OutboundJob, Message, etc.) remain valid because conversation row still exists

### Verification Steps

```bash
# 1. Verify migration applied
npx prisma migrate status

# 2. Test delete (idempotent)
curl -X DELETE http://localhost:3000/api/admin/conversations/123/delete \
  -H "Cookie: session=..." \
  # First call: returns { ok: true, deletedMessages: N }
  # Second call: returns { ok: true, deletedMessages: N, wasAlreadyDeleted: true }

# 3. Verify conversation still exists in DB
npx prisma studio
# Check Conversation table: deletedAt should be set, row still exists

# 4. Verify inbox excludes deleted
curl http://localhost:3000/api/inbox/conversations \
  -H "Cookie: session=..."
# Response should NOT include conversation with deletedAt set

# 5. Test restore
curl -X POST http://localhost:3000/api/admin/conversations/123/restore \
  -H "Cookie: session=..."
# Returns { ok: true }
# Verify deletedAt is null in DB
```

### Grep Verification

```bash
# Verify all inbox queries filter deletedAt
grep -r "conversation.findMany" src/app/api/inbox --include="*.ts" | grep -v "deletedAt"
# Should return empty (all queries should have deletedAt filter)

# Verify delete endpoint is idempotent
grep -A 5 "already deleted" src/app/api/admin/conversations/[id]/delete/route.ts
# Should show return success, not error
```

---

## PHASE 2: Lead Routing & Fallback Resolution

### What Changed

**Files Modified:**
- `src/app/api/leads/[id]/route.ts` - Enhanced fallback resolution:
  - Strategy A: If numeric ID is a conversationId, resolve to leadId
  - Strategy B: If numeric ID is a contactId, find most recent active lead
  - Strategy C: If conversationId in query params, resolve to leadId
  - Strategy D: If contactId in query params, find most recent active lead
  - Preserves query params (e.g., `?action=assign`)

**Files Verified:**
- `src/app/inbox/page.tsx` - "View Lead" uses `selectedLead.id` ✅ (correct)
- `src/app/leads/[id]/page.tsx` - Handles redirect hints from API ✅

### How Fallback Resolution Works

1. **Primary:** Try to fetch lead by numeric ID as `leadId`
2. **Fallback A:** If not found, check if numeric ID is a `conversationId` → resolve to `leadId`
3. **Fallback B:** If not found, check if numeric ID is a `contactId` → find most recent active lead
4. **Fallback C:** If `conversationId` in query params → resolve to `leadId`
5. **Fallback D:** If `contactId` in query params → find most recent active lead
6. **Empty State:** If all fail, return 404 with helpful actions (Back to Leads, Open Inbox, Create Lead)

**Query Param Preservation:**
- `?action=assign` is preserved through all redirects
- All search params are preserved in redirect URL

### Verification Steps

```bash
# 1. Test direct leadId (should work)
curl http://localhost:3000/api/leads/123
# Returns lead data

# 2. Test conversationId as ID (should redirect)
curl http://localhost:3000/api/leads/456
# If 456 is a conversationId, returns:
# { _redirect: "/leads/789", _fallbackReason: "ID 456 was a conversationId..." }

# 3. Test with action param (should preserve)
curl "http://localhost:3000/api/leads/456?action=assign"
# Redirect URL should include ?action=assign

# 4. Test in browser
# Navigate to /leads/456 (where 456 is conversationId)
# Should redirect to /leads/789 (actual leadId)
```

### Grep Verification

```bash
# Verify all lead links use leadId (not conversationId/contactId)
grep -r "href.*leads" src/app/inbox --include="*.tsx"
# Should show: /leads/${selectedLead.id} (correct)

# Verify fallback resolution exists
grep -A 10 "Fallback resolution" src/app/api/leads/[id]/route.ts
# Should show Strategy A, B, C, D
```

---

## PHASE 3: Visual Baseline Cleanup

### What Changed

**Files Modified:**
- `public/brand/alain-logo.webp` - Downloaded from https://alainbcenter.com/wp-content/uploads/2025/10/Al-Ain-Logo.webp
- `src/components/layout/Sidebar.tsx` - Already has logo with fallback ✅
- `src/app/globals.css` - Already has theme tokens ✅

**Theme Tokens (Already Present):**
- `--bg-app`, `--bg-card`, `--border-subtle`, `--text`, `--muted`, `--shadow-premium`
- Light + dark mode tokens
- Dark mode uses deep navy/charcoal (not pure black)

**Spacing Rhythm:**
- `--spacing-xs: 4px`, `--spacing-sm: 8px`, `--spacing-md: 16px`, `--spacing-lg: 24px`, `--spacing-xl: 32px`
- Applied consistently in dashboard + lead page

**Red Backgrounds:**
- ✅ Only used for: badges, labels, small dots (not large blocks)
- Verified: No large red background blocks found

### Verification Steps

```bash
# 1. Verify logo exists
ls -lh public/brand/alain-logo.webp
# Should show file exists (~5.4KB)

# 2. Test logo loads in browser
# Navigate to app, check sidebar logo
# Should show Alain logo or fallback "A" if image fails

# 3. Verify no large red blocks
grep -r "bg-red" src --include="*.tsx" | grep -v "badge\|label\|dot\|chip"
# Should return empty (red only in badges/labels)

# 4. Verify theme tokens
grep -r "var(--bg-app)" src --include="*.tsx" | head -5
# Should show usage of theme tokens
```

---

## PHASE 4: Lead Page Functionality

### Components Verified

**Lead DNA (Left):**
- `src/components/leads/LeadDNA.tsx` - ✅ Exists
- Qualification checklist ✅
- Expiry timeline ✅
- Sponsor search ✅

**Conversation Workspace (Center):**
- `src/components/leads/ConversationWorkspace.tsx` - ✅ Exists
- WhatsApp-like bubbles ✅
- Date separators ✅
- Scroll-to-bottom button ✅

**Next Best Action Panel (Right):**
- `src/components/leads/NextBestActionPanel.tsx` - ✅ Exists
- ONE primary CTA ✅
- "Why now" line ✅
- Context strip (last inbound/outbound, stage chips) ✅
- Tasks collapsed by default (max 3) ✅

**Mobile Layout:**
- `src/app/leads/[id]/page.tsx` - ✅ Chat-first layout
- Bottom action dock ✅
- Sheets for info/action ✅

### Verification Steps

```bash
# 1. Verify components exist
ls -la src/components/leads/LeadDNA.tsx
ls -la src/components/leads/ConversationWorkspace.tsx
ls -la src/components/leads/NextBestActionPanel.tsx
# All should exist

# 2. Test lead page loads
# Navigate to /leads/123 in browser
# Should show 3-column layout (desktop) or chat-first (mobile)

# 3. Test mobile layout
# Resize browser to <1024px
# Should show chat-first with bottom dock
```

---

## Build Verification

```bash
# Run build
npm run build

# Expected output:
# ✓ Compiled successfully
# ✓ Linting and checking validity of types
# ✓ Creating an optimized production build
```

---

## Manual QA Checklist

### Delete Chat
- [ ] As admin, open inbox conversation
- [ ] Click "Delete Chat" button
- [ ] Confirm deletion
- [ ] Verify conversation disappears from inbox list
- [ ] Verify no FK constraint error in console
- [ ] Call delete endpoint again (idempotent test)
- [ ] Verify returns success (not error)
- [ ] Verify conversation still exists in DB with `deletedAt` set
- [ ] Test restore endpoint (admin only)
- [ ] Verify conversation reappears in inbox

### Lead Routing
- [ ] Navigate to `/leads/123` (valid leadId) - should load
- [ ] Navigate to `/leads/456` (conversationId) - should redirect to correct leadId
- [ ] Navigate to `/leads/789?action=assign` - should preserve query param
- [ ] Click "View Lead" from inbox - should open correct lead
- [ ] Navigate to `/leads/999` (non-existent) - should show empty state with actions

### Visual Baseline
- [ ] Check sidebar logo loads (or shows fallback)
- [ ] Verify spacing is consistent (16/24/32px rhythm)
- [ ] Verify no large red background blocks
- [ ] Check dark mode uses deep navy (not pure black)
- [ ] Verify theme tokens applied consistently

### Lead Page
- [ ] Desktop: Verify 3-column layout (Lead DNA, Conversation, Next Best Action)
- [ ] Mobile: Verify chat-first with bottom dock
- [ ] Verify Lead DNA shows qualification checklist
- [ ] Verify Conversation Workspace shows message bubbles
- [ ] Verify Next Best Action shows primary CTA
- [ ] Verify tasks collapsed by default (max 3 shown)

---

## Files Changed Summary

### Modified Files
1. `src/app/api/admin/conversations/[id]/delete/route.ts` - Made idempotent
2. `src/app/api/leads/[id]/route.ts` - Enhanced fallback resolution, added deletedAt filter
3. `public/brand/alain-logo.webp` - Downloaded logo

### Verified Files (No Changes Needed)
1. `src/app/api/inbox/conversations/route.ts` - Already filters deletedAt ✅
2. `src/app/api/inbox/refresh-intelligence/route.ts` - Already filters deletedAt ✅
3. `src/app/api/admin/conversations/[id]/restore/route.ts` - Already exists ✅
4. `src/app/inbox/page.tsx` - Uses correct leadId ✅
5. `src/components/layout/Sidebar.tsx` - Already has logo ✅
6. `src/app/globals.css` - Already has theme tokens ✅

---

## Migration Commands

```bash
# Verify migration status
npx prisma migrate status

# If migration missing, apply:
npx prisma migrate deploy

# Verify schema matches
npx prisma db pull
npx prisma generate
```

---

## Rollback Plan

If issues occur:

1. **Delete Chat:** Revert `src/app/api/admin/conversations/[id]/delete/route.ts` to previous version
2. **Lead Routing:** Revert `src/app/api/leads/[id]/route.ts` to previous version
3. **Visual:** Remove logo file, revert any CSS changes

All changes are backward-compatible (soft delete preserves data, fallback resolution is additive).

---

## Notes

- **No AI/Orchestrator Changes:** All fixes preserve existing AI behavior
- **Minimal DB Changes:** Only uses existing `Conversation.deletedAt` field
- **Deterministic:** All routing/fallback logic is deterministic (no LLM calls)
- **Backward Compatible:** All changes are additive or idempotent

---

**End of Audit**

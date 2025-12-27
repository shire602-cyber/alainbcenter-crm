# STRICT CURSOR COMMAND - FIX ALL CRITICAL ISSUES ASAP

## CRITICAL ISSUES TO FIX IMMEDIATELY

### Issue 1: Duplicate Conversations
**Problem**: Two inbox items created for one contact
**Root Cause**: Race condition in conversation creation, conversations not properly deduplicated
**Fix**: 
- Use proper error handling for unique constraint violations
- Always link conversation to lead when creating/updating
- Update existing conversations to link to current lead

### Issue 2: Messages Split Across Conversations
**Problem**: Incoming and outgoing messages appear in different conversation windows
**Root Cause**: Conversations not properly linked to leads, messages created in wrong conversations
**Fix**:
- Ensure all messages (inbound/outbound) use the same conversation
- Link conversation to lead when creating messages
- Update conversation timestamps correctly

### Issue 3: Service Type Not Saved
**Problem**: User says "freelance visa" but service area is empty in lead page
**Root Cause**: Service extraction only updates if `serviceTypeEnum` is null, not updating on subsequent messages
**Fix**:
- Always update `serviceTypeEnum` if service is extracted (even if already set)
- Update on every message, not just first
- Store in both `serviceTypeEnum` and `dataJson`

### Issue 4: Lead Data Not Updating
**Problem**: Changes not reflected in lead pages
**Root Cause**: Lead updates not happening, or data not being saved correctly
**Fix**:
- Ensure lead updates happen after field extraction
- Update `dataJson` with all extracted fields
- Update `serviceTypeEnum` field directly

### Issue 5: AI Hallucination
**Problem**: AI not following strict rules, hallucinating
**Root Cause**: Strict qualification rules only applied to Golden Visa, not all services
**Fix**:
- Apply `validateQualificationRules` to ALL AI replies, not just Golden Visa
- Enforce max 1 question per reply
- Enforce max 5 questions total
- Remove forbidden phrases from all replies

## IMPLEMENTATION CHECKLIST

- [x] Fix conversation creation to prevent duplicates (use error handling for unique constraint)
- [x] Always link conversation to lead when creating/updating
- [x] Link existing conversations to new leads
- [x] Always update serviceTypeEnum if service is extracted (not just when null)
- [x] Update lead dataJson with all extracted fields
- [x] Apply strict qualification rules to all AI replies
- [x] Ensure all messages use same conversation
- [x] Include contactId in message creation

## FILES MODIFIED

1. `src/lib/inbound/autoMatchPipeline.ts`
   - Fixed conversation creation with proper error handling
   - Always link conversation to lead
   - Link existing conversations to new leads
   - Always update serviceTypeEnum (not just when null)
   - Update dataJson with all fields

2. `src/lib/autoReply.ts`
   - Apply strict qualification rules to all AI replies
   - Validate all replies against strict rules

## TESTING REQUIRED

1. Send message "I want freelance visa" → Check lead page shows FREELANCE_VISA
2. Send multiple messages from same contact → Check only one conversation exists
3. Send inbound and outbound messages → Check both appear in same conversation
4. Check AI replies → Verify no forbidden phrases, max 1 question per reply
5. Check lead data → Verify serviceTypeEnum and dataJson are updated


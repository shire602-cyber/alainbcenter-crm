# CRITICAL FIXES - ASAP

## Issues Identified

1. **Duplicate conversations** - Two inbox items for one contact
2. **Messages split across conversations** - Incoming/outgoing in different windows
3. **Service type not saved** - "freelance visa" not appearing in lead
4. **Lead data not updating** - Changes not reflected in lead pages
5. **AI hallucination** - Not following strict rules

## Root Causes

1. **Conversation creation race condition** - `findFirst` + `create` can create duplicates
2. **Conversation not linked to lead** - `leadId` not set when creating conversation
3. **Service extraction too conservative** - Only updates if `serviceTypeEnum` is null
4. **Conversation lookup inconsistency** - Different functions use different queries
5. **AI not using strict qualification** - Only Golden Visa uses strict rules

## Fixes Required

### Fix 1: Conversation Deduplication
- Use `upsert` with unique constraint `[contactId, channel]`
- Always link conversation to lead (`leadId`)
- Update `leadId` if conversation exists but leadId is null

### Fix 2: Service Extraction Enhancement
- Always update service if extracted (even if already set)
- Update on every message, not just first
- Store in both `serviceTypeEnum` and `dataJson`

### Fix 3: Conversation-Lead Linking
- Ensure all conversations are linked to leads
- Update existing conversations to link to current lead
- Use lead's conversation for all messages

### Fix 4: Strict AI Rules for All Services
- Apply strict qualification rules to all services, not just Golden Visa
- Max 1 question per reply
- Max 5 questions total
- Never use forbidden phrases

### Fix 5: Message Linking
- Ensure all messages (inbound/outbound) use same conversation
- Link conversation to lead when creating messages
- Update conversation timestamps correctly


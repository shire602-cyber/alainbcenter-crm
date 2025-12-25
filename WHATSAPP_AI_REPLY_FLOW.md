# WhatsApp AI Reply Flow - Strict Implementation

## Overview

This document describes the strict AI pipeline implemented to fix hallucination, service confusion, and ensure consistent, customer-facing replies.

## Architecture

### 1. Conversation Identity
- **Primary Key**: `(contactId, channel)` - ensures one conversation per phone number per channel
- **External ID**: Optional metadata only, NOT used for lookup
- **Service Locking**: Once a service is identified, it's locked on the conversation to prevent switching

### 2. Strict JSON Output Schema

AI must return valid JSON with this structure:

```json
{
  "reply": "Customer-facing message only (no reasoning, no signatures)",
  "service": "visit_visa|freelance_visa|freelance_permit_visa|investor_visa|pro_work|business_setup|family_visa|golden_visa|unknown",
  "stage": "qualify|quote|handover",
  "needsHuman": false,
  "missing": ["nationality", "location"],
  "confidence": 0.8
}
```

**Only the `reply` field is sent to customers.**

### 3. Sanitization Layer

Before sending, replies are sanitized to block:
- Reasoning/planning text ("Let's proceed", "I should", "I will")
- Signatures ("Best regards", "Regards", "Sincerely")
- Quoted messages (internal reasoning)
- Promises/guarantees ("guaranteed", "approval guaranteed", "no risk")
- Discounts (we don't offer)
- Invented dates (dates not in conversation or DB)

### 4. Service Locking

Once a service is identified:
- It's persisted on the conversation as `lockedService`
- AI is instructed to stay on that service
- Only changes if customer explicitly requests different service

### 5. Training Documents

- Training documents are retrieved and injected into the prompt
- Pricing and requirements MUST come from training docs
- If pricing not available, set `needsHuman=true`

### 6. Model Settings

- **Groq Llama**: temperature 0.3, top_p 0.9 (reduced hallucinations)
- **OpenAI/Claude**: Standard settings for complex tasks

## Flow Diagram

```
Inbound WhatsApp Message
    ↓
Find/Create Conversation (by contactId + channel)
    ↓
Store Message
    ↓
Extract Provided Info (nationality, location, service, expiry)
    ↓
Retrieve Training Documents
    ↓
Build Strict Prompt (with rules, pricing, service lock)
    ↓
Generate JSON Output (via LLM routing)
    ↓
Parse & Sanitize
    ↓
Lock Service (if identified)
    ↓
Send ONLY reply field to WhatsApp
    ↓
Log Decision (AutoReplyLog)
```

## Key Files

- `src/lib/ai/strictGeneration.ts` - Main strict AI generation
- `src/lib/ai/strictPrompt.ts` - Strict prompt builder with rules
- `src/lib/ai/outputSchema.ts` - JSON schema and sanitization
- `src/lib/autoReply.ts` - Integration with inbound message handler

## Testing

Run the test script:
```bash
npx tsx scripts/test-strict-ai-reply.ts
```

## Acceptance Criteria

✅ PASS if:
- User messages "freelance how much" → correct price logic, coherent flow
- No hallucinated expiry dates
- No "Best regards" or agent name changes
- One conversation per phone number
- Service doesn't switch mid-conversation

❌ FAIL if:
- Any internal reasoning appears in WhatsApp messages
- Service confusion (freelance → visit visa)
- Generic repeated acknowledgments after second message


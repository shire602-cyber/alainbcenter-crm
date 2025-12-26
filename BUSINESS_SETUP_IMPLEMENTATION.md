# Business Setup Qualification Flow Implementation

## Overview

Implemented a dedicated Business Setup qualification handler with MAX 5 questions, special offer handling, and "marketing license" shortcut acceptance.

## Key Features

### 1. MAX 5 Questions Flow
- Q1: Name (only if not known)
- Q2: Business activity (accepts "marketing license" without drilling)
- Q3: Mainland vs Freezone
- Q4: Partners/shareholders count
- Q5: Visa count + contact details (phone/email) in ONE message

### 2. Special Offer Handling
- Detects "cheapest", "lowest", "minimum", "best price", "budget", "offer"
- Responds with: "Professional Mainland License + Investor Visa for just AED 12,999"
- Continues to next missing question (doesn't count offer as a question)
- Shows offer only once per conversation

### 3. Marketing License Shortcut
- Accepts "marketing license", "marketing", "advertising license" as-is
- Normalizes to "Marketing / Advertising"
- Logs activity and moves to next question
- NO follow-up drilling (sales will confirm details on call)

### 4. Activity Acceptance Rules
- Accepts broad labels: "X license" format
- Normalizes common activities:
  - Marketing → "Marketing / Advertising"
  - IT → "IT Services"
  - Accounting → "Accounting / Bookkeeping"
  - General Trading → "General Trading"
  - Consultancy → "Consultancy"
  - E-commerce → "E-commerce"

### 5. Regulated Activity Detection
- Detects: medical, clinic, pharmacy, education, school, legal, law, insurance, bank, exchange, crypto
- Adds note: "This activity may need special approvals. Our specialist will confirm the exact requirements in your quote."
- No extra question, just informational note

### 6. Hard Constraints Enforced
- ✅ MAX 5 questions total
- ✅ Never asks "Are you inside the UAE?"
- ✅ Never asks nationality for Business Setup
- ✅ Never repeats same question
- ✅ Never outputs internal reasoning
- ✅ Filters forbidden phrases

### 7. Idempotency & Deduplication
- Inbound: Checks `providerMessageId` unique constraint
- Outbound: Checks `triggerProviderMessageId` unique constraint
- Cooldown: 3-second cooldown prevents race conditions
- Duplicate detection: Checks exact message text within 5 seconds

## Implementation Files

### Core Handler
- `src/lib/ai/businessSetupHandler.ts` - Main qualification handler

### Integration
- `src/lib/autoReply.ts` - Routes business_setup intent to handler
- `src/lib/conversation/flowState.ts` - Conversation state persistence
- `src/lib/webhook/idempotency.ts` - Idempotency checks

## Conversation State Structure

```typescript
{
  service_intent: 'business_setup',
  asked_question_count: number,
  asked_questions: { [key: string]: boolean },
  collected: {
    full_name?: string,
    business_activity?: string,
    jurisdiction?: 'mainland' | 'freezone',
    partners_count?: number | string,
    visa_count?: number | string,
    phone?: string,
    email?: string
  },
  cheapest_offer_shown?: boolean
}
```

## Field Extraction

### Name
- 2+ words, not "hi/hello/hey"
- Takes first 2-3 words

### Business Activity
- Detects keywords: marketing, advertising, IT, accounting, trading, consultancy, e-commerce
- Accepts "X license" format
- Normalizes to standard labels

### Jurisdiction
- "mainland" → mainland
- "freezone" / "free zone" → freezone

### Partners Count
- Parses: "1", "one", "2", "two", "3", "three", "3+", "single", "solo"

### Visa Count
- Parses: "0", "none", "zero", "no visa", "1", "one", "2", "two", "3", "three", "3+"

### Phone
- UAE format: `(+971|0)?[5-9]\d{8}`

### Email
- Standard email regex

## Forbidden Phrases Filtered

- "guaranteed", "approval guaranteed", "inside contact", "no risk", "discount", "fake documents"
- "i should", "let's proceed", "i will ask", "my next question"

## Activity Taxonomy Extension (NEW - Additive Only)

### Taxonomy Groups

**Professional & Services:**
- Marketing & Advertising, Digital Marketing, Social Media Management
- Influencer / Content Creator, Consultancy, IT Services
- Software / Web / App Development, Media Production
- Design / Creative, Accounting / Bookkeeping, HR / Recruitment

**Trading & Commercial:**
- General Trading, E-Commerce, Import & Export
- Foodstuff Trading, Electronics Trading, Building Materials Trading

**Lifestyle & Consumer:**
- Salon / Beauty, Fitness / Gym, Restaurant / Café
- Cloud Kitchen, Catering

**Industrial / Operational:**
- Cleaning Services, Facilities Management, Logistics
- Warehousing, Construction, Interior Design

**Regulated / Special Approval:**
- Real Estate / Brokerage, Travel & Tourism
- Medical / Clinic / Pharmacy, Education / Training Institute
- Legal Services, Insurance, Crypto / Blockchain
- Financial / Investment Advisory, Security Services, Manpower Supply

### Enhanced Features

1. **Activity Tagging**: Automatically tags user input with best match from taxonomy
2. **Raw Text Storage**: Stores exact user wording in `raw_activity_text`
3. **Confidence Scoring**: 
   - HIGH: marketing, IT, consultancy, trading, cleaning, e-commerce
   - LOW: "any business", "not sure", vague responses
4. **Regulated Detection**: Enhanced keyword detection for special approval activities
5. **Metadata Storage**: Saves `activity_tag`, `regulated_flag`, `confidence_level` for sales use

### Integration Notes

- Taxonomy is used ONLY for tagging/routing (not shown to users)
- No additional questions asked
- MAX 5 questions constraint remains intact
- All existing functionality preserved (non-breaking addition)

## Testing Checklist

### Manual Acceptance Tests

1. ✅ "I want marketing license" → "Perfect — Marketing license noted." + asks Mainland/Freezone
2. ✅ "freezone" → asks partners
3. ✅ "1" → asks visas + phone/email
4. ✅ "cheapest" mid-flow → shows AED 12,999 offer + continues next question
5. ✅ Same inbound message twice → only one outbound reply
6. ✅ Never asks "inside UAE"
7. ✅ Never asks nationality
8. ✅ Never exceeds 5 questions
9. ✅ Never repeats same question
10. ✅ Blocks internal reasoning output
11. ✅ "real estate brokerage" → regulated_flag=true, warns approvals needed
12. ✅ "any business" → confidence=low, no extra questions, flagged for review

### Integration Tests Needed

- [ ] Unit tests for `businessSetupHandler.ts`
- [ ] Integration tests for webhook → handler → outbound flow
- [ ] Concurrency tests (parallel requests)
- [ ] Idempotency tests (duplicate webhooks)

## Next Steps

1. Add comprehensive unit tests
2. Add integration tests
3. Monitor production logs for:
   - `[BUSINESS-SETUP]` logs
   - Question count never > 5
   - No repeated questions
   - Idempotency hits

## Logging

Key log prefixes:
- `🏢 [BUSINESS-SETUP]` - Handler entry/exit
- `📊 [OUTBOUND-LOG]` - Outbound message logging
- `⚠️ [COOLDOWN]` - Cooldown detection
- `⚠️ [IDEMPOTENCY]` - Duplicate detection


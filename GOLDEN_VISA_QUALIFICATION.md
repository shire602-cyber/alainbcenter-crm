# Golden Visa Qualification (Strict, Low-Hallucination)

## Overview

Golden Visa generates the most unqualified leads. This system ensures AI qualifies quickly, politely, and avoids false promises. We only escalate to human when the customer is likely eligible AND wants to proceed soon.

## Non-Negotiable Rules

- **Never say**: "guaranteed", "approval guaranteed", "100%", "inside contact", "government connection"
- **Do not invent** categories or requirements - only use internal "Golden Visa Policy JSON" as truth
- **Max 1 clarifying question** per reply
- **Max 4 questions total**
- **Don't reject harshly**: if "maybe" → keep polite + request one missing proof item, or offer alternative

## Core Behavior

### 1. Detect Intent

Keywords that trigger Golden Visa qualification:
- "golden visa"
- "10 year visa"
- "gold visa"
- "golden"

### 2. Qualification Flow (Max 4 Questions)

**Q1**: "Which Golden Visa category are you applying under? (Investor / Professional / Entrepreneur / Student / Talent like Media / Scientist / Other)"

**Q2**: Category-specific proof question (varies by category)

**Q3**: "Do you already have supporting documents ready? (yes/partly/no)"

**Q4**: "When would you like to get started? (ASAP / this week / this month / later)"

### 3. Escalation Rules

**Escalate to human if**:
- `likelyEligible = true` AND
- `startTimeline != "later"`

**Actions on escalation**:
- Create Task: "Golden Visa Consultation + Document Verification" (due in 24 hours, HIGH priority)
- Create Alert: "Likely qualified Golden Visa lead" (severity=high)

**If not eligible-likely**:
- Respond politely: explain that eligibility depends on meeting category criteria
- Offer alternative service: freelance visa / investor visa / business setup / visit visa
- Create Task: "Offer alternative pathway" (optional)

## Golden Visa Categories

### 1. Real Estate Investor
- **Min Proof**: Property in UAE with value >= threshold (admin-editable), Ownership proof/title deed
- **Questions**: Property value in AED, Fully paid or mortgaged?
- **Eligibility**: `valueProvided && value >= threshold`

### 2. Skilled Professional
- **Min Proof**: Valid employment contract, Salary evidence (admin-editable threshold), Degree attestation
- **Questions**: Job title and monthly salary in AED, Attested degree? (yes/partly/no)
- **Eligibility**: `salaryProvided && salary >= threshold`

### 3. Entrepreneur / Startup
- **Min Proof**: Company ownership, Revenue/valuation or incubator/authority endorsement, Business license
- **Questions**: Own a UAE company or startup? (UAE / outside UAE), Endorsement/approval or strong company documents? (yes/partly/no)
- **Eligibility**: `companyOwner && docsYesOrPartly`

### 4. Talent / Media Personality
- **Min Proof**: Portfolio/press/proof of work, Awards/recognition OR strong professional profile
- **Questions**: Type of media work (influencer / journalist / presenter / filmmaker / other), Portfolio/press links/awards? (yes/partly/no)
- **Eligibility**: `proofYesOrPartly`

### 5. Outstanding Student / Graduate
- **Min Proof**: Academic standing / GPA / top ranking, University documents
- **Questions**: Student or graduate? University and GPA/grade?, Official transcripts/certificates ready? (yes/partly/no)
- **Eligibility**: `gpaProvided && docsYesOrPartly`

### 6. Scientist / Researcher
- **Min Proof**: Research publications / patents, University/institution affiliation, Awards/recognition
- **Questions**: Field of research and publications/patents?, Proof of research work? (yes/partly/no)
- **Eligibility**: `proofYesOrPartly`

## Admin-Configurable Settings

Settings are stored in `Integration` table with `name='golden_visa_settings'` and `config` JSON field:

```json
{
  "minPropertyValueAED": 2000000,
  "minSalaryAED": 30000,
  "minCompanyRevenueAED": 1000000,
  "minGPA": 3.5,
  "requireDegreeAttestation": true,
  "requireBankNOCForMortgage": true
}
```

**Default thresholds** (if not configured):
- Min Property Value: 2,000,000 AED
- Min Salary: 30,000 AED/month
- Min Company Revenue: 1,000,000 AED
- Min GPA: 3.5
- Require Degree Attestation: true
- Require Bank NOC for Mortgage: true

## Implementation

### Files

- **Policy**: `src/lib/policies/goldenVisaPolicy.json` - Single source of truth for categories and requirements
- **Qualifier**: `src/lib/qualifiers/goldenVisaQualify.ts` - Main qualification logic
- **Handler**: `src/lib/inbound/goldenVisaHandler.ts` - Integration with auto-match pipeline
- **Integration**: `src/lib/autoReply.ts` - Integrated into auto-reply flow

### Data Storage

Qualification state stored in `Lead.dataJson.goldenVisa`:

```json
{
  "categoryKey": "talent_media",
  "answers": {
    "mediaType": "influencer",
    "proofStatus": "partly"
  },
  "proofStatus": "partly",
  "likelyEligible": true,
  "startTimeline": "this week",
  "questionsAsked": 3,
  "nextQuestion": null,
  "shouldEscalate": true,
  "handoverReason": "Likely eligible for Talent / Media personality and wants to start this week"
}
```

### Integration Flow

1. **Inbound message** → `handleInboundMessageAutoMatch()`
2. **Service detection** → `extractService()` detects "GOLDEN_VISA"
3. **Auto-reply** → `handleInboundAutoReply()` checks if Golden Visa
4. **Qualifier** → `handleGoldenVisaQualification()` runs qualification
5. **Reply** → Uses qualifier reply text (not AI-generated)
6. **Tasks/Alerts** → Created if eligible and timeline is soon

## Test Cases

### Test 1: "golden visa media personality" → asks Q1 then Q2 portfolio proof question
- Input: "I want a golden visa, I am a media personality"
- Expected: Q1 category question, then Q2 portfolio proof question

### Test 2: "I don't know category" → ask Q1 with options; do not invent
- Input: "I don't know which category"
- Expected: Q1 with all valid options (Investor, Professional, Entrepreneur, Student, Talent like Media, Scientist, Other)
- Should NOT invent categories

### Test 3: "maybe" answers → still can escalate if timeline soon
- Input: "maybe" for documents, "this week" for timeline
- Expected: `proofStatus = "partly"`, `shouldEscalate = true` (if eligible)

### Test 4: Never uses forbidden phrases
- Any reply text should NOT contain: "guaranteed", "approval guaranteed", "100%", "inside contact", "government connection"

## Usage

### Admin: Configure Settings

```typescript
// Create/update Golden Visa settings
await prisma.integration.upsert({
  where: { name: 'golden_visa_settings' },
  create: {
    name: 'golden_visa_settings',
    provider: 'system',
    isEnabled: true,
    config: JSON.stringify({
      minPropertyValueAED: 2000000,
      minSalaryAED: 30000,
      // ... other settings
    }),
  },
  update: {
    config: JSON.stringify({
      // Updated settings
    }),
  },
})
```

### Manual Qualification

```typescript
import { goldenVisaQualify } from '@/lib/qualifiers/goldenVisaQualify'

const result = await goldenVisaQualify(
  leadId,
  conversationId,
  messageText,
  lastQuestion
)

if (result.shouldEscalate) {
  // Create task and alert
}
```

## Success Criteria

✅ **Never hallucinates** - Only uses policy JSON, never invents categories  
✅ **Never promises** - No "guaranteed", "100%", "inside contact"  
✅ **Quick qualification** - Max 4 questions, max 1 per reply  
✅ **Polite rejection** - Offers alternatives, doesn't reject harshly  
✅ **Smart escalation** - Only escalates if eligible AND timeline is soon  


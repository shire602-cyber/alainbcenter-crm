# Documents & Compliance Intelligence Implementation

## Overview

The Documents & Compliance Intelligence system transforms document tracking into a smart compliance system with:
- Per-service document checklists
- Clear "missing / uploaded / expiring" status
- AI-powered document reminder messages
- Compliance status indicators (GOOD / WARNING / CRITICAL)
- Automation rules for missing docs and document expiry

## Data Model

### Document Model
- `category`: String (PASSPORT, EID, PHOTO, EJARI, COMPANY_LICENSE, BANK_STATEMENT, TENANCY_CONTRACT, VISA_PAGE, OTHER)
- `expiryDate`: DateTime? (for documents that expire)
- `storageProvider`: String (default: "local")
- `storagePath`: String? (server path)
- `url`: String? (public URL)

### ServiceDocumentRequirement Model
- `serviceType`: String (matches serviceTypeEnum values)
- `documentType`: String (PASSPORT | EID | PHOTO | EJARI | COMPANY_LICENSE | BANK_STATEMENT | OTHER)
- `label`: String (display name)
- `isMandatory`: Boolean (default: true)
- `order`: Int (display order)
- `description`: String? (optional instructions)

## API Endpoints

### GET /api/leads/[id]/documents
Returns both documents and requirements:
```json
{
  "documents": [...],
  "requirements": [...]
}
```

### POST /api/leads/[id]/documents/upload
Accepts multipart/form-data:
- `file`: File
- `category`: Document type

### PATCH /api/leads/[id]/documents/[docId]
Update document metadata:
- `category`: Document type
- `expiryDate`: Date string or null
- `fileName`: Label

### DELETE /api/leads/[id]/documents/[docId]
Deletes document and file from storage.

### GET /api/leads/[id]/compliance
Returns compliance status:
```json
{
  "ok": true,
  "compliance": {
    "status": "GOOD" | "WARNING" | "CRITICAL",
    "missingMandatory": ["Passport Copy", "Ejari"],
    "expiringSoon": ["EID (expires in 12 days)"],
    "expired": [],
    "notes": "2 mandatory document(s) missing.",
    "score": 50
  }
}
```

### POST /api/leads/[id]/docs/ai-reminder
Generate AI-powered document reminder:
```json
{
  "channel": "WHATSAPP" | "EMAIL"
}
```

Returns:
```json
{
  "ok": true,
  "draft": "Hello John! 👋\n\nWe hope you're doing well...",
  "channel": "WHATSAPP"
}
```

## Lead Detail UI

### Documents & Compliance Card

**Component**: `DocumentsCardEnhanced`

**Features**:
1. **Compliance Progress Bar**: Shows X/Y docs completed
2. **Required Documents Checklist**:
   - Status icons (✓ uploaded, ⚠ expired, ⏰ expiring soon, ⚠ missing)
   - Color-coded rows (green/red/yellow)
   - Quick actions: "Upload" for missing, "View" for uploaded
3. **Uploaded Documents List**:
   - File name, category badge, upload date
   - Expiry date with status
   - View/Delete actions
4. **Upload Modal**:
   - File picker
   - Document type selector
   - Optional expiry date picker
5. **AI Reminder Buttons**:
   - WhatsApp reminder (Sparkles icon)
   - Email reminder (Mail icon)
   - Fills message composer with AI-generated reminder

### Compliance Badge in Header

Added to `LeadDetailPagePremium.tsx` header:
- Shows "Compliance: WARNING" or "Compliance: CRITICAL" badge
- Only displays when status is not GOOD
- Color-coded (red for CRITICAL, yellow for WARNING)

## Compliance Status Calculation

**File**: `src/lib/compliance.ts`

### Logic

1. **Load Requirements**: Get all mandatory `ServiceDocumentRequirement` for lead's service type
2. **Check Documents**: For each requirement, find matching document by `category` matching `documentType`
3. **Categorize**:
   - `missingMandatory`: Requirements without any uploaded document
   - `expiringSoon`: Documents with `expiryDate` within 30 days
   - `expired`: Documents with `expiryDate` < now
4. **Calculate Score** (0-100):
   - Start at 100
   - -50 points per missing mandatory doc
   - -40 points per expired doc
   - -10 points per expiring soon doc
5. **Determine Status**:
   - `CRITICAL`: Any expired mandatory docs
   - `WARNING`: Missing mandatory docs OR expiring soon docs
   - `GOOD`: All docs present and valid

## AI Document Reminders

**File**: `src/lib/aiDocsReminder.ts`

### Function: `generateDocsReminderMessage()`

**Input**:
- `leadId`: number
- `channel`: 'WHATSAPP' | 'EMAIL'

**Process**:
1. Load lead with contact info
2. Get compliance status
3. Build structured prompt for OpenAI:
   - Client name, service type
   - Missing/expired/expiring docs list
   - Channel-specific tone requirements
   - Safety guardrails (no guaranteed approvals)
4. Call OpenAI API (or fallback to template)

**Output**: Professional reminder message ready to send

**Safety**:
- Never promises guaranteed approvals
- Uses phrases like "we can assist", "we can help you process"
- Avoids "100% guaranteed"

## Automation Rules

### 1. Missing Mandatory Docs on QUALIFIED

**Trigger**: `STAGE_CHANGE`
**Conditions**:
- `toStage`: 'QUALIFIED'
- `missingMandatoryDocs`: true

**Actions**:
- `CREATE_TASK`: "Collect missing documents for {lead.contact.fullName}"
- `SEND_AI_REPLY`: WhatsApp, mode DOCS

### 2. Document Expiry – 30 Days

**Trigger**: `EXPIRY_WINDOW`
**Conditions**:
- `documentExpiryInDays`: 30
- `documentTypes`: ['EID', 'VISA_PAGE', 'COMPANY_LICENSE']

**Actions**:
- `CREATE_TASK`: "Document expiring in 30 days"
- `SEND_AI_REPLY`: WhatsApp, mode DOCS

### 3. Document Expiry – 7 Days (Urgent)

**Trigger**: `EXPIRY_WINDOW`
**Conditions**:
- `documentExpiryInDays`: 7
- `documentTypes`: ['EID', 'VISA_PAGE', 'COMPANY_LICENSE']

**Actions**:
- `CREATE_TASK`: "URGENT: Document expiring in 7 days"
- `SEND_AI_REPLY`: WhatsApp, mode DOCS
- `SET_PRIORITY`: URGENT

### Seeding Rules

```bash
# Via API (requires admin auth)
curl -X POST http://localhost:3000/api/admin/automation/seed-documents \
  -H "Cookie: session=..."

# Or via script
npx tsx src/scripts/seed-document-automation-rules.ts
```

## Automation Engine Enhancements

### EXPIRY_WINDOW Trigger

Now supports two modes:
1. **Expiry Items** (original): `expiryType`, `daysBefore`
2. **Document Expiry** (new): `documentExpiryInDays`, `documentTypes[]`

When `documentExpiryInDays` is specified:
- Queries `Document` records with `expiryDate`
- Filters by `documentTypes` if specified
- Matches documents expiring within the window

### STAGE_CHANGE Trigger

Enhanced to support:
- `toStage`: Target stage
- `fromStage`: Previous stage (optional)
- `missingMandatoryDocs`: Boolean (checks compliance status)

When `missingMandatoryDocs: true`:
- Calls `getLeadComplianceStatus()` to check for missing mandatory documents
- Only triggers if missing docs are found

### Integration with Lead Updates

When lead stage changes via `PATCH /api/leads/[id]`:
- Automatically triggers `STAGE_CHANGE` automation rules
- Non-blocking (doesn't delay API response)
- Errors are logged but don't fail the request

## UX Features

### Documents Card Enhancements

1. **Compliance Progress Bar**: Visual indicator of completion (X/Y docs)
2. **Color-Coded Checklist**:
   - Green: Uploaded and valid
   - Yellow: Expiring soon
   - Red: Expired or missing mandatory
3. **Quick Actions**:
   - "Upload" button on missing docs
   - "View" button on uploaded docs
4. **Upload Modal**:
   - Drag-and-drop file input
   - Document type dropdown
   - Expiry date picker (optional)
5. **AI Reminder Buttons**:
   - Separate buttons for WhatsApp and Email
   - Emits `ai-draft-generated` event to fill composer

### Compliance Badge

- Appears in lead detail header next to AI score
- Only shows when status is WARNING or CRITICAL
- Tooltip shows compliance notes
- Clicking could scroll to Documents section (future enhancement)

## Safety & Guardrails

1. **AI Messages**:
   - Never promise guaranteed approvals
   - Professional, compliant wording
   - Channel-appropriate tone (WhatsApp vs Email)

2. **Autopilot Toggle**:
   - Respects `lead.autopilotEnabled`
   - If false, automation creates tasks but doesn't send messages

3. **Cooldown Protection**:
   - Rules respect cooldown periods
   - `AutomationRunLog` prevents duplicate triggers

4. **Error Handling**:
   - Compliance calculation failures don't break lead detail page
   - AI reminder failures fall back to template
   - Document upload errors are user-friendly

## Configuration

### Setting Up Document Requirements

Via API:
```bash
POST /api/service-document-requirements
{
  "serviceType": "FAMILY_VISA",
  "documentType": "PASSPORT",
  "label": "Passport Copy (All Pages)",
  "isMandatory": true,
  "order": 1,
  "description": "Clear copy of all passport pages"
}
```

Or via database directly:
```sql
INSERT INTO ServiceDocumentRequirement (serviceType, documentType, label, isMandatory, "order")
VALUES ('FAMILY_VISA', 'PASSPORT', 'Passport Copy', true, 1);
```

## Notes

- Document `category` field maps to `ServiceDocumentRequirement.documentType`
- Matching is case-insensitive
- Multiple documents of the same type are allowed (latest is used for compliance)
- Expiry tracking works for any document with `expiryDate` set
- Compliance status is recalculated on document upload/delete
- Automation rules are event-driven (STAGE_CHANGE) or scheduled (EXPIRY_WINDOW via daily cron)

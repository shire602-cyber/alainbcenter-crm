# Expiry Extraction Update - Explicit Dates Only

## ✅ Implementation Complete

### Changes Made

#### 1. **Field Extractor (`src/lib/inbound/fieldExtractors.ts`)**
- ✅ Updated `extractExpiry()` to **ONLY extract explicit dates**
- ✅ Added rejection logic for relative dates ("next month", "in 2 weeks", "soon", etc.)
- ✅ Enhanced date parsing to support:
  - DD/MM/YYYY, DD-MM-YYYY
  - YYYY-MM-DD (ISO format)
  - DD/MM/YY, DD-MM-YY (with 2-digit year normalization: 00-49 → 20YY, 50-99 → 19YY)
  - "10 Feb 2026", "10 February 2026"
  - "Feb 10, 2026"
- ✅ Added `extractExpiryHint()` function to detect expiry mentions without explicit dates
- ✅ Returns the full sentence containing the expiry mention for storage as hint

#### 2. **Pipeline Integration (`src/lib/inbound/autoMatchPipeline.ts`)**
- ✅ Added `expiryHint` to `AutoMatchResult` interface
- ✅ Updated `extractFields()` to call `extractExpiryHint()`
- ✅ Stores `expiry_hint_text` in `lead.dataJson` when expiry is mentioned but no explicit date found
- ✅ Passes `expiryHint` to `createAutoTasks()`

#### 3. **Auto Tasks (`src/lib/inbound/autoTasks.ts`)**
- ✅ Added `expiryHint` parameter to `AutoTaskInput` interface
- ✅ **Task 4: Expiry Hint Confirmation**
  - Creates task: "Confirm expiry date" (type: DOCUMENT_REQUEST)
  - Due: End of day
  - IdempotencyKey: `confirm-expiry:${leadId}:${YYYY-MM-DD}`
- ✅ Creates alert/notification:
  - Type: 'system'
  - Title: "Expiry mentioned but no date provided"
  - Message: Includes the hint text
  - Severity: Medium (via notification type)

#### 4. **UI Integration (`src/app/leads/[id]/LeadDetailPagePremium.tsx`)**
- ✅ Added "Unverified Expiry Hint" section in Expiry Tracker card
- ✅ Displays hint text from `lead.dataJson.expiry_hint_text`
- ✅ Shows yellow warning styling
- ✅ "Confirm Date" button opens expiry modal to add verified expiry

### Behavior

#### ✅ Explicit Dates (Creates LeadExpiry)
- "My visa expires 10/02/2026" → Creates `VISA_EXPIRY` with date 2026-02-10
- "EID expiry 10-02-2026" → Creates `EMIRATES_ID_EXPIRY` with date 2026-02-10
- "my visa expires 10/02/26" → Creates expiry with normalized year (2026) + logs normalization

#### ❌ Rejected Formats (Creates Hint + Task)
- "My visa expires next month" → NO LeadExpiry; creates hint + confirm task
- "expires Feb 2026" → NO LeadExpiry; creates hint + confirm task
- "expires soon" → NO LeadExpiry; creates hint + confirm task
- "expires in 30 days" → NO LeadExpiry; creates hint + confirm task

### Reminder Scheduling

- ✅ **Only verified expiries** (from LeadExpiry records) trigger reminders
- ✅ Default reminder offsets: 90, 60, 30, 7, 3, 1 (days before expiry)
- ✅ `nextReminderAt` computed from `expiryDate - offset`
- ✅ `stopRemindersAfterReply = true` by default
- ❌ **Hints never trigger reminders** (no automation from hints)

### Test Cases

#### Test A: ✅ Explicit Date
**Input:** "My visa expires 10/02/2026"
**Expected:**
- Creates `LeadExpiry` with type=`VISA_EXPIRY`, date=2026-02-10
- Creates renewal follow-up task
- NO hint stored
- NO confirm task

#### Test B: ✅ Explicit Date (Dash Format)
**Input:** "EID expiry 10-02-2026"
**Expected:**
- Creates `LeadExpiry` with type=`EMIRATES_ID_EXPIRY`, date=2026-02-10
- Creates renewal follow-up task
- NO hint stored

#### Test C: ❌ Relative Date
**Input:** "My visa expires next month"
**Expected:**
- NO LeadExpiry created
- Stores `expiry_hint_text` in `lead.dataJson`
- Creates task: "Confirm expiry date" (due end of day)
- Creates alert: "Expiry mentioned but no date provided"

#### Test D: ❌ Month-Year Only
**Input:** "expires Feb 2026"
**Expected:**
- NO LeadExpiry created
- Stores hint
- Creates confirm task + alert

#### Test E: ✅ 2-Digit Year Normalization
**Input:** "my visa expires 10/02/26"
**Expected:**
- Creates `LeadExpiry` with date=2026-02-10 (normalized from 26)
- Logs normalization: "Normalized 2-digit year: 26 -> 2026"
- Creates renewal task

### Files Modified

1. `src/lib/inbound/fieldExtractors.ts` - Updated expiry extraction logic
2. `src/lib/inbound/autoMatchPipeline.ts` - Added hint detection and storage
3. `src/lib/inbound/autoTasks.ts` - Added expiry hint confirmation task
4. `src/app/leads/[id]/LeadDetailPagePremium.tsx` - Added UI for unverified hints

### Next Steps

- ✅ Implementation complete
- ⏳ Testing recommended with sample messages
- ⏳ Monitor logs for date normalization cases
- ⏳ Verify UI displays hints correctly


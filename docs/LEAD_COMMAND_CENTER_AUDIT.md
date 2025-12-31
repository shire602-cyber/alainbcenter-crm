# Lead Command Center - Implementation Audit

## Overview

The Lead page has been transformed into a "Lead Command Center" with three phases of enhancements:

- **Phase A**: Completeness & Correctness (Health Strip, wiring fixes)
- **Phase B**: Playbooks (deterministic workflows)
- **Phase C**: Power Interactions (command palette, keyboard shortcuts, optimistic UI)

## Phase A - Completeness & Correctness

### ✅ Health Strip Component

**Location:** `src/components/leads/LeadHealthStrip.tsx`

**Features:**
- SLA status indicator (dot + label: "SLA Breached", "SLA Risk", "On Track")
- Waiting time display (relative time since last inbound)
- Service label (clickable, scrolls to service section)
- Stage chip (clickable, scrolls to stage selector)
- Owner chip (clickable, opens assign dialog)

**Integration:**
- Added to `ConversationWorkspace` component at the top of conversation area
- Receives lead data as prop
- Click handlers navigate to relevant sections

### ✅ Wiring Fixes

**Mobile Dock Buttons:**
- Reply: Opens composer (`setComposerOpen(true)`)
- Call: Opens phone dialer (`tel:` link)
- WhatsApp: Opens WhatsApp Web (`wa.me` link)
- Action: Opens Next Best Action sheet

**LeadDNA Sponsor Search:**
- Persists search state
- Re-renders instantly on selection
- Updates contact's `localSponsorName` field

**Qualification Checklist:**
- Updates live from `knownFields` (fetched from conversation state)
- Shows progress (X/5 fields completed)
- Required fields based on service type

**NextBestAction Primary CTA:**
- `open_composer`: Focuses textarea and scrolls into view
- `create_task`: Creates task via API
- `open_quote_modal`: Navigates to quote flow
- `navigate`: Navigates to specified route

## Phase B - Playbooks

### ✅ Playbooks Library

**Location:** `src/lib/leads/playbooks.ts`

**Available Playbooks:**
1. **request_docs**: Request documents for business setup
   - Sends templated message with required docs list
   - Creates `DOC_COLLECTION` task (7 days due)
   - Updates stage from `NEW` to `CONTACTED` if applicable

2. **send_pricing**: Send pricing information
   - Sends templated message about pricing
   - Creates `QUOTE` task (2 days due)
   - Updates stage from `QUALIFIED` to `PROPOSAL_SENT` if applicable

3. **renewal_reminder**: Send renewal reminder
   - Sends templated message with expiry date
   - Creates `RENEWAL` task (30 days before expiry)
   - Uses expiry date from `knownFields` or lead data

4. **quote_followup**: Follow up on sent quote
   - Sends templated follow-up message
   - Creates `FOLLOW_UP` task (3 days due)

**Playbook Selection:**
- `getAvailablePlaybooks()` returns relevant playbooks based on:
  - Service type (business setup, visa, etc.)
  - Lead stage (NEW, CONTACTED, QUALIFIED, etc.)

### ✅ Playbooks API

**Location:** `src/app/api/leads/[id]/playbooks/run/route.ts`

**Endpoint:** `POST /api/leads/[id]/playbooks/run`

**Input:**
```json
{
  "playbookKey": "request_docs",
  "channel": "whatsapp",
  "dryRun": false
}
```

**Behavior:**
1. Loads lead + conversation
2. Loads `knownFields` from conversation state
3. Executes playbook (renders template with variables)
4. Sends message via `sendOutboundWithIdempotency`
5. Creates tasks in transaction
6. Updates stage if needed
7. Logs activity event to `CommunicationLog`

**Response:**
```json
{
  "ok": true,
  "playbookKey": "request_docs",
  "result": {
    "messageId": 123,
    "tasksCreated": 1,
    "stageUpdated": true
  }
}
```

### ✅ Playbooks UI

**Location:** `src/components/leads/NextBestActionPanel.tsx` (PlaybooksSection component)

**Features:**
- Collapsed by default (Accordion)
- Shows top 2 relevant playbooks based on service + stage
- One-tap execution
- Loading state during execution
- Toast notification on success/error
- Page refresh to show updated state

## Phase C - Power Interactions

### ✅ Command Palette (Cmd+K)

**Location:** `src/components/leads/LeadCommandPalette.tsx`

**Commands:**
1. **Assign Owner**: Navigate to assign dialog
2. **Run Playbook: Request Documents**: Execute `request_docs` playbook
3. **Create Task**: Navigate to task creation
4. **Snooze Lead**: Navigate to snooze menu
5. **Open Quote Flow**: Navigate to quote creation

**Features:**
- Opens with `Cmd+K` or `Ctrl+K`
- Search/filter commands by keywords
- Keyboard navigation (Arrow keys, Enter, Escape)
- Visual selection highlight
- Closes on selection or Escape

**Integration:**
- Added to `LeadDetailPage` component
- State managed via `commandPaletteOpen`
- Keyboard shortcut handler in `useEffect`

### ✅ Keyboard Shortcuts

**Location:** `src/app/leads/[id]/page.tsx`

**Shortcuts:**
- **R**: Focus reply composer
  - Finds textarea with placeholder containing "message"
  - Focuses and scrolls into view
  - Opens composer if closed

- **A**: Open action panel/sheet
  - Opens Next Best Action sheet (mobile)
  - Scrolls to Next Best Action panel (desktop)

- **T**: Open create task dialog
  - Navigates to `/leads/[id]?action=task`

- **S**: Open snooze menu
  - Navigates to `/leads/[id]?action=snooze`

**Safety:**
- Shortcuts disabled when typing in input/textarea
- Checks `target.tagName` and `isContentEditable`
- Only active when lead page is loaded

### ✅ Optimistic UI for Playbooks

**Location:** `src/components/leads/ConversationWorkspace.tsx` + `NextBestActionPanel.tsx`

**Flow:**
1. User clicks playbook button
2. `playbook-executing` event dispatched with `messageId`
3. `ConversationWorkspace` listens for event
4. Fetches playbook preview via `dryRun=true`
5. Shows optimistic message bubble (blue, "sending" status)
6. When API succeeds, `playbook-success` event dispatched
7. Message bubble turns green ("sent" status)
8. After 2 seconds, optimistic message removed
9. Actual message loaded via `loadMessages()`
10. If API fails, `playbook-error` event dispatched
11. Message bubble turns red ("error" status)
12. Dismiss button shown for error state

**Visual States:**
- **Sending**: Blue background, spinning clock icon
- **Sent**: Green background, checkmark (briefly)
- **Error**: Red background, alert icon, dismiss button

## Manual QA Checklist

### Phase A
- [ ] Health Strip displays correctly at top of conversation
- [ ] SLA status shows correct color (red/orange/green)
- [ ] Clicking SLA status focuses composer
- [ ] Clicking service label scrolls to service section
- [ ] Clicking stage chip scrolls to stage selector
- [ ] Clicking owner chip opens assign dialog
- [ ] Mobile dock buttons work (Reply, Call, WhatsApp, Action)
- [ ] Sponsor search persists and re-renders
- [ ] Qualification checklist updates from knownFields
- [ ] Next Best Action primary CTA triggers correct behavior

### Phase B
- [ ] Playbooks section appears in Next Best Action panel
- [ ] Playbooks section is collapsed by default
- [ ] Top 2 relevant playbooks shown based on service + stage
- [ ] Clicking playbook executes successfully
- [ ] Toast notification appears on success
- [ ] Tasks created after playbook execution
- [ ] Message sent after playbook execution
- [ ] Stage updated if applicable
- [ ] Activity logged to CommunicationLog

### Phase C
- [ ] `Cmd+K` opens command palette
- [ ] `Ctrl+K` opens command palette (Windows/Linux)
- [ ] Command palette search works
- [ ] Keyboard navigation works (Arrow keys, Enter, Escape)
- [ ] Commands execute correctly
- [ ] `R` key focuses composer (when not typing)
- [ ] `A` key opens action panel (when not typing)
- [ ] `T` key opens task dialog (when not typing)
- [ ] `S` key opens snooze menu (when not typing)
- [ ] Shortcuts disabled when typing in input/textarea
- [ ] Optimistic message appears when playbook executes
- [ ] Optimistic message turns green on success
- [ ] Optimistic message turns red on error
- [ ] Optimistic message dismisses after 2 seconds (success) or on dismiss button (error)

## Shortcut List

| Shortcut | Action | Notes |
|----------|--------|-------|
| `Cmd+K` / `Ctrl+K` | Open command palette | Global on lead page |
| `R` | Focus reply composer | Disabled when typing |
| `A` | Open action panel | Disabled when typing |
| `T` | Open create task dialog | Disabled when typing |
| `S` | Open snooze menu | Disabled when typing |
| `Escape` | Close command palette | When palette is open |
| `Arrow Up/Down` | Navigate commands | When palette is open |
| `Enter` | Execute selected command | When palette is open |

## Playbooks List and Expected Outcomes

### request_docs
**When Available:** Business setup services in NEW/CONTACTED/ENGAGED/QUALIFIED stages

**Expected Outcome:**
- Message sent with document request template
- `DOC_COLLECTION` task created (due in 7 days)
- Stage updated from `NEW` to `CONTACTED` (if applicable)
- Activity logged: "Requested documents via playbook"

### send_pricing
**When Available:** QUALIFIED or PROPOSAL_SENT stage

**Expected Outcome:**
- Message sent with pricing information template
- `QUOTE` task created (due in 2 days)
- Stage updated from `QUALIFIED` to `PROPOSAL_SENT` (if applicable)
- Activity logged: "Sent pricing information via playbook"

### renewal_reminder
**When Available:** Any lead (always available)

**Expected Outcome:**
- Message sent with renewal reminder template (includes expiry date)
- `RENEWAL` task created (due 30 days before expiry)
- Activity logged: "Sent renewal reminder via playbook"

### quote_followup
**When Available:** PROPOSAL_SENT or QUOTE_SENT stage

**Expected Outcome:**
- Message sent with quote follow-up template
- `FOLLOW_UP` task created (due in 3 days)
- Activity logged: "Sent quote follow-up via playbook"

## Files Changed

### New Files
- `src/components/leads/LeadHealthStrip.tsx`
- `src/lib/leads/playbooks.ts`
- `src/app/api/leads/[id]/playbooks/run/route.ts`
- `src/components/leads/LeadCommandPalette.tsx`
- `docs/LEAD_COMMAND_CENTER_AUDIT.md`

### Modified Files
- `src/app/leads/[id]/page.tsx` (keyboard shortcuts, command palette integration)
- `src/components/leads/ConversationWorkspace.tsx` (Health Strip, optimistic UI)
- `src/components/leads/NextBestActionPanel.tsx` (Playbooks section)

## Build Status

✅ `npm run build` passes successfully

## Notes

- No AI/orchestrator logic changes
- No database schema changes (uses existing tables)
- Visual style consistent with premium tokens
- No red backgrounds (red only as tiny dot/label)
- Sync guarantees preserved (no field wiping, knownFields merge behavior intact)


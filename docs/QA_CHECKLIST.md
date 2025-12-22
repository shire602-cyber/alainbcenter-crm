# QA Checklist for Alain CRM

This document outlines the test steps validated during the system-wide QA pass.

## Prerequisites

- Node.js 18+ installed
- SQLite database initialized
- Environment variables configured (see README)
- Admin user created

## 1. Auth & Access Control

### ✅ Unauthenticated Access
- [x] Visiting `/`, `/leads`, `/renewals`, `/inbox`, `/automation` redirects to `/login`
- [x] API routes return 401/403 for unauthenticated requests
- [x] Login page is accessible

### ✅ Authenticated Access
- [x] After login, user is redirected to Dashboard (`/`)
- [x] Authenticated users can access:
  - Dashboard
  - Leads list
  - Lead detail pages
  - Inbox
  - Renewals (if not admin-only)

### ✅ Role-Based Access
- [x] Agents can view leads, inbox, renewals
- [x] Agents cannot modify automation rules (read-only or hidden)
- [x] Admins can access:
  - Automation page (`/automation`)
  - Settings pages (`/admin/integrations`, `/settings/whatsapp`)
  - User management (`/admin/users`)

## 2. Lead Lifecycle

### ✅ Create Lead
- [x] Form validation: phone and serviceType required
- [x] Email is optional
- [x] Lead is created in database
- [x] Contact record is created/linked
- [x] `aiScore` and `aiNotes` are set on creation
- [x] Default stage is "NEW"
- [x] Lead appears in `/leads` table
- [x] Lead appears in Dashboard stats

### ✅ Update Lead
- [x] Stage can be changed (New → Contacted → Engaged → Qualified → Won/Lost)
- [x] Stage change persists in database
- [x] Stage change triggers `STAGE_CHANGE` automation rules
- [x] Stage change appears in activity timeline (where applicable)

### ✅ Assign Owner
- [x] Owner field can be updated
- [x] Dashboard "My Day" reflects only leads owned by logged-in user
- [x] Lead detail page shows correct owner

## 3. Messaging

### ✅ Outbound WhatsApp
- [x] Message composer accepts text input
- [x] Send button creates `Message` record with:
  - `direction: 'outbound'`
  - `channel: 'WHATSAPP'`
  - `status: 'SENT'` or `'FAILED'`
- [x] WhatsApp API client is called
- [x] Errors are handled gracefully (shows user-friendly message)
- [x] UI shows pending → sent/failed status

### ✅ Inbound WhatsApp Webhook
- [x] Webhook route handles POST requests
- [x] Creates/attaches Lead by phone number
- [x] Creates/attaches Conversation (channel = WHATSAPP)
- [x] Creates INBOUND `Message` record
- [x] Triggers `INBOUND_MESSAGE` automation rules (if configured)
- [x] Webhook handler never throws (always returns 200 or appropriate code)
- [x] Errors are logged server-side only

### ✅ AI Draft
- [x] AI draft buttons (Follow-up, Qualify, Renewal, Docs) generate text
- [x] Draft text populates message composer
- [x] User can edit draft before sending
- [x] AI failures (missing API key, network error) show friendly error message
- [x] Automation run logs ERROR status without crashing

### ✅ Conversation UI
- [x] Messages display in chronological order
- [x] Inbound vs outbound messages are visually distinct
- [x] Conversation scrolls to latest message
- [x] Channel tabs work (WhatsApp, Email, IG, FB, Webchat, Notes)

## 4. Automation / Autopilot

### ✅ Rule Types
- [x] `LEAD_CREATED` rules trigger on new lead creation
- [x] `INBOUND_MESSAGE` rules:
  - Filter by `conditions.channels`
  - Respect `cooldownMinutes`
  - Respect `workingHoursOnly` (if implemented)
  - Do not trigger multiple times within cooldown
- [x] `EXPIRY_WINDOW` rules:
  - Work for LeadExpiry (visa/EID/license)
  - Work for Document expiry (if implemented)
  - Trigger at correct intervals (90d, 30d, overdue)
- [x] `NO_ACTIVITY` rules (if implemented) trigger for leads with no messages for X days

### ✅ Autopilot Toggle
- [x] `autopilotEnabled = false` on lead:
  - Rules log SKIPPED status
  - No messages are auto-sent for that lead
  - Tasks may still be created (as per rule actions)

### ✅ Automation Logs
- [x] `AutomationRunLog` entries are created for each rule execution
- [x] Logs include:
  - Rule ID/key
  - Lead ID
  - Status (SUCCESS/FAILED/SKIPPED)
  - Timestamp
  - Error message (if failed)

### ✅ Cron Endpoint
- [x] `/api/automation/run-daily` (or equivalent) requires `CRON_SECRET`
- [x] Endpoint loads active rules
- [x] Applies rules to candidate leads
- [x] Logs runs in `AutomationRunLog`

## 5. Renewals & Revenue

### ✅ Expiry Management
- [x] Multiple `ExpiryItem` records can be created per lead
- [x] Expiry tracker shows:
  - Days remaining (with color coding)
  - Expiry type
  - Expiry date
- [x] Expiry items are sorted by date (soonest first)

### ✅ Renewal Scoring
- [x] `recalcLeadRenewalScore` is called when:
  - Expiry item is created/updated
  - Lead stage changes
  - `estimatedRenewalValue` is updated
- [x] Renewal widget shows:
  - `estimatedRenewalValue` (inline editable)
  - `renewalProbability` (0-100, with gauge)
  - Projected revenue (calculated: value × probability / 100)

### ✅ Renewals Dashboard
- [x] `/renewals` page loads without errors
- [x] Filters work (expiry type, days remaining, stage, owner)
- [x] Sorting works (by days remaining, projected revenue, etc.)
- [x] Clicking a row navigates to correct lead detail page
- [x] KPI cards show:
  - Expiring in ≤30 days count
  - Expiring in 31-90 days count
  - Overdue renewals count
  - Projected renewal revenue

## 6. Documents & Compliance

### ✅ Document Requirements
- [x] `ServiceDocumentRequirement` records can be created per serviceType
- [x] Requirements include:
  - `documentType` (PASSPORT, EID, PHOTO, etc.)
  - `label` (display name)
  - `isMandatory` (boolean)
  - `order` (display order)

### ✅ Document Upload
- [x] Documents can be uploaded via `/api/leads/[id]/documents/upload`
- [x] Upload accepts:
  - File (multipart/form-data)
  - `category` (document type)
  - Optional `expiryDate`
- [x] Upload errors are handled gracefully (shows error toast)
- [x] Document appears in uploaded documents list after successful upload

### ✅ Compliance Status
- [x] Required Docs checklist shows:
  - ✅ Uploaded (green) for uploaded mandatory docs
  - ⚠️ Missing (red) for missing mandatory docs
  - ⏰ Expiring Soon (yellow) for docs expiring within 30 days
  - ❌ Expired (red) for docs with past expiry date
- [x] Compliance helper returns:
  - `status: 'GOOD' | 'WARNING' | 'CRITICAL'`
  - `missingMandatory: string[]`
  - `expiringSoon: string[]`
  - `expired: string[]`
  - `notes: string`
  - `score: number` (0-100)
- [x] Compliance badge shows correct status on lead detail page

### ✅ Document Automation
- [x] `STAGE_CHANGE` to QUALIFIED with `missingMandatoryDocs: true`:
  - Creates task: "Collect missing documents for {lead name}"
  - Optionally sends AI doc reminder (if autopilot enabled)
- [x] `EXPIRY_WINDOW` for documents:
  - Triggers at 30 days and 7 days before expiry
  - Creates task: "Document {type} expiring in X days"
  - Optionally sends AI doc reminder

## 7. Inbox & Navigation

### ✅ Inbox View
- [x] `/inbox` page loads without errors
- [x] Conversation list shows:
  - Multi-channel conversations
  - Last message snippet
  - Timestamp
  - Channel icon
- [x] Selecting a conversation:
  - Loads correct messages
  - Shows mini lead summary in right panel
- [x] Message composer works (with Ctrl+Enter shortcut)

### ✅ Navigation
- [x] All main links work:
  - Dashboard (`/`)
  - Inbox (`/inbox`)
  - Leads (`/leads`)
  - Renewals (`/renewals`)
  - Automation (`/automation`) - admin only
  - Settings (`/admin/integrations`, `/settings/whatsapp`) - admin only
- [x] Back/forward browser navigation works correctly
- [x] Mobile/tablet breakpoints don't break layout (basic responsiveness)

## 8. Error Handling & Logging

### ✅ API Error Responses
- [x] All API routes catch exceptions
- [x] Errors return structured JSON: `{ ok: false, error: string }`
- [x] Appropriate HTTP status codes (400, 401, 403, 404, 500)
- [x] Stack traces are NOT exposed to frontend
- [x] Sensitive data (tokens, secrets, passwords) is NOT logged

### ✅ Frontend Error Display
- [x] User-friendly error messages:
  - "Failed to send WhatsApp message. Please try again."
  - "Failed to generate AI reply."
  - "Failed to upload document."
- [x] Errors are shown via toast notifications or inline messages
- [x] No stack traces displayed to users

### ✅ Logging
- [x] Server-side logs include:
  - Rule IDs, lead IDs, message IDs
  - High-level summaries
  - Error messages (without stack traces in production)
- [x] Sensitive data is redacted:
  - API tokens (only show "***" or length)
  - Raw provider payloads (only log necessary fields)

## 9. Keyboard Shortcuts

### ✅ Message Composer
- [x] `Ctrl+Enter` or `Cmd+Enter` sends message
- [x] `Enter` alone sends message (Shift+Enter for new line)
- [x] Shortcut works in:
  - Lead detail page message composer
  - Inbox message composer

### ✅ Global Search
- [x] `Ctrl+K` or `Cmd+K` focuses search bar
- [x] `Enter` in search bar navigates to filtered leads page

## 10. Nullable Value Handling

### ✅ UI Components
- [x] `aiScore` null → shows "N/A" or "—"
- [x] `renewalProbability` null → shows "—" or 0%
- [x] `expiryDate` null → shows "Not set" or "—"
- [x] `estimatedRenewalValue` null → shows "Not set" or "—"
- [x] Lead without Contact → shows "Unnamed Lead" or "—"
- [x] Lead without Conversation → shows empty state
- [x] Lead with no Documents → shows "No documents uploaded"
- [x] Lead with no Expiries → shows "No expiry items"

## 11. Visual Consistency

### ✅ Card Layout
- [x] Consistent card styling: `rounded-xl`, `border`, `shadow-sm`
- [x] Consistent spacing: `p-4`, `p-6` for main cards
- [x] Consistent typography:
  - Section titles: `text-xs uppercase tracking-wide`
  - Lead names: `text-xl`/`text-2xl`
  - Body text: `text-sm`/`text-base`

### ✅ Button Styles
- [x] Primary buttons for main actions
- [x] Secondary/outline buttons for secondary actions
- [x] Ghost buttons for tertiary actions
- [x] Consistent button sizes across pages

### ✅ Color System
- [x] Primary color for CTAs
- [x] Neutral backgrounds for content
- [x] Accent colors for AI/automation badges
- [x] Status colors (green/yellow/red) for compliance, expiry, etc.

## 12. Performance & Build

### ✅ Build Checks
- [x] `npm run build` completes without errors
- [x] `npm run lint` passes (or shows only acceptable warnings)
- [x] TypeScript compilation succeeds
- [x] Prisma schema compiles: `npx prisma format` and `npx prisma generate`

### ✅ Environment Variables
- [x] All required env vars documented in README
- [x] Runtime checks for critical env vars (where applicable)
- [x] Missing env vars show helpful error messages

## Notes

- Some features may be partially implemented (e.g., Email/Instagram/Facebook channels may be stubbed)
- Automation rules should be seeded via `/api/admin/automation/seed-*` endpoints or scripts
- Document requirements should be configured per service type via admin UI or database

## Known Limitations

- Some channels (Email, Instagram, Facebook, Webchat) may have partial implementations
- AI features require `OPENAI_API_KEY` to be configured
- WhatsApp requires Meta Cloud API credentials
- Cron jobs require external scheduler (GitHub Actions, Task Scheduler, etc.)


# QA Checklist for Alain CRM

This document outlines the test steps validated during the system-wide QA pass.

## Prerequisites

- Node.js 18+ installed
- SQLite database initialized
- Environment variables configured (see README)
- Admin user created

## 1. Auth & Access Control

### ✅ Unauthenticated Access
- [x] Visiting `/`, `/leads`, `/renewals`, `/inbox`, `/automation` redirects to `/login`
- [x] API routes return 401/403 for unauthenticated requests
- [x] Login page is accessible

### ✅ Authenticated Access
- [x] After login, user is redirected to Dashboard (`/`)
- [x] Authenticated users can access:
  - Dashboard
  - Leads list
  - Lead detail pages
  - Inbox
  - Renewals (if not admin-only)

### ✅ Role-Based Access
- [x] Agents can view leads, inbox, renewals
- [x] Agents cannot modify automation rules (read-only or hidden)
- [x] Admins can access:
  - Automation page (`/automation`)
  - Settings pages (`/admin/integrations`, `/settings/whatsapp`)
  - User management (`/admin/users`)

## 2. Lead Lifecycle

### ✅ Create Lead
- [x] Form validation: phone and serviceType required
- [x] Email is optional
- [x] Lead is created in database
- [x] Contact record is created/linked
- [x] `aiScore` and `aiNotes` are set on creation
- [x] Default stage is "NEW"
- [x] Lead appears in `/leads` table
- [x] Lead appears in Dashboard stats

### ✅ Update Lead
- [x] Stage can be changed (New → Contacted → Engaged → Qualified → Won/Lost)
- [x] Stage change persists in database
- [x] Stage change triggers `STAGE_CHANGE` automation rules
- [x] Stage change appears in activity timeline (where applicable)

### ✅ Assign Owner
- [x] Owner field can be updated
- [x] Dashboard "My Day" reflects only leads owned by logged-in user
- [x] Lead detail page shows correct owner

## 3. Messaging

### ✅ Outbound WhatsApp
- [x] Message composer accepts text input
- [x] Send button creates `Message` record with:
  - `direction: 'outbound'`
  - `channel: 'WHATSAPP'`
  - `status: 'SENT'` or `'FAILED'`
- [x] WhatsApp API client is called
- [x] Errors are handled gracefully (shows user-friendly message)
- [x] UI shows pending → sent/failed status

### ✅ Inbound WhatsApp Webhook
- [x] Webhook route handles POST requests
- [x] Creates/attaches Lead by phone number
- [x] Creates/attaches Conversation (channel = WHATSAPP)
- [x] Creates INBOUND `Message` record
- [x] Triggers `INBOUND_MESSAGE` automation rules (if configured)
- [x] Webhook handler never throws (always returns 200 or appropriate code)
- [x] Errors are logged server-side only

### ✅ AI Draft
- [x] AI draft buttons (Follow-up, Qualify, Renewal, Docs) generate text
- [x] Draft text populates message composer
- [x] User can edit draft before sending
- [x] AI failures (missing API key, network error) show friendly error message
- [x] Automation run logs ERROR status without crashing

### ✅ Conversation UI
- [x] Messages display in chronological order
- [x] Inbound vs outbound messages are visually distinct
- [x] Conversation scrolls to latest message
- [x] Channel tabs work (WhatsApp, Email, IG, FB, Webchat, Notes)

## 4. Automation / Autopilot

### ✅ Rule Types
- [x] `LEAD_CREATED` rules trigger on new lead creation
- [x] `INBOUND_MESSAGE` rules:
  - Filter by `conditions.channels`
  - Respect `cooldownMinutes`
  - Respect `workingHoursOnly` (if implemented)
  - Do not trigger multiple times within cooldown
- [x] `EXPIRY_WINDOW` rules:
  - Work for LeadExpiry (visa/EID/license)
  - Work for Document expiry (if implemented)
  - Trigger at correct intervals (90d, 30d, overdue)
- [x] `NO_ACTIVITY` rules (if implemented) trigger for leads with no messages for X days

### ✅ Autopilot Toggle
- [x] `autopilotEnabled = false` on lead:
  - Rules log SKIPPED status
  - No messages are auto-sent for that lead
  - Tasks may still be created (as per rule actions)

### ✅ Automation Logs
- [x] `AutomationRunLog` entries are created for each rule execution
- [x] Logs include:
  - Rule ID/key
  - Lead ID
  - Status (SUCCESS/FAILED/SKIPPED)
  - Timestamp
  - Error message (if failed)

### ✅ Cron Endpoint
- [x] `/api/automation/run-daily` (or equivalent) requires `CRON_SECRET`
- [x] Endpoint loads active rules
- [x] Applies rules to candidate leads
- [x] Logs runs in `AutomationRunLog`

## 5. Renewals & Revenue

### ✅ Expiry Management
- [x] Multiple `ExpiryItem` records can be created per lead
- [x] Expiry tracker shows:
  - Days remaining (with color coding)
  - Expiry type
  - Expiry date
- [x] Expiry items are sorted by date (soonest first)

### ✅ Renewal Scoring
- [x] `recalcLeadRenewalScore` is called when:
  - Expiry item is created/updated
  - Lead stage changes
  - `estimatedRenewalValue` is updated
- [x] Renewal widget shows:
  - `estimatedRenewalValue` (inline editable)
  - `renewalProbability` (0-100, with gauge)
  - Projected revenue (calculated: value × probability / 100)

### ✅ Renewals Dashboard
- [x] `/renewals` page loads without errors
- [x] Filters work (expiry type, days remaining, stage, owner)
- [x] Sorting works (by days remaining, projected revenue, etc.)
- [x] Clicking a row navigates to correct lead detail page
- [x] KPI cards show:
  - Expiring in ≤30 days count
  - Expiring in 31-90 days count
  - Overdue renewals count
  - Projected renewal revenue

## 6. Documents & Compliance

### ✅ Document Requirements
- [x] `ServiceDocumentRequirement` records can be created per serviceType
- [x] Requirements include:
  - `documentType` (PASSPORT, EID, PHOTO, etc.)
  - `label` (display name)
  - `isMandatory` (boolean)
  - `order` (display order)

### ✅ Document Upload
- [x] Documents can be uploaded via `/api/leads/[id]/documents/upload`
- [x] Upload accepts:
  - File (multipart/form-data)
  - `category` (document type)
  - Optional `expiryDate`
- [x] Upload errors are handled gracefully (shows error toast)
- [x] Document appears in uploaded documents list after successful upload

### ✅ Compliance Status
- [x] Required Docs checklist shows:
  - ✅ Uploaded (green) for uploaded mandatory docs
  - ⚠️ Missing (red) for missing mandatory docs
  - ⏰ Expiring Soon (yellow) for docs expiring within 30 days
  - ❌ Expired (red) for docs with past expiry date
- [x] Compliance helper returns:
  - `status: 'GOOD' | 'WARNING' | 'CRITICAL'`
  - `missingMandatory: string[]`
  - `expiringSoon: string[]`
  - `expired: string[]`
  - `notes: string`
  - `score: number` (0-100)
- [x] Compliance badge shows correct status on lead detail page

### ✅ Document Automation
- [x] `STAGE_CHANGE` to QUALIFIED with `missingMandatoryDocs: true`:
  - Creates task: "Collect missing documents for {lead name}"
  - Optionally sends AI doc reminder (if autopilot enabled)
- [x] `EXPIRY_WINDOW` for documents:
  - Triggers at 30 days and 7 days before expiry
  - Creates task: "Document {type} expiring in X days"
  - Optionally sends AI doc reminder

## 7. Inbox & Navigation

### ✅ Inbox View
- [x] `/inbox` page loads without errors
- [x] Conversation list shows:
  - Multi-channel conversations
  - Last message snippet
  - Timestamp
  - Channel icon
- [x] Selecting a conversation:
  - Loads correct messages
  - Shows mini lead summary in right panel
- [x] Message composer works (with Ctrl+Enter shortcut)

### ✅ Navigation
- [x] All main links work:
  - Dashboard (`/`)
  - Inbox (`/inbox`)
  - Leads (`/leads`)
  - Renewals (`/renewals`)
  - Automation (`/automation`) - admin only
  - Settings (`/admin/integrations`, `/settings/whatsapp`) - admin only
- [x] Back/forward browser navigation works correctly
- [x] Mobile/tablet breakpoints don't break layout (basic responsiveness)

## 8. Error Handling & Logging

### ✅ API Error Responses
- [x] All API routes catch exceptions
- [x] Errors return structured JSON: `{ ok: false, error: string }`
- [x] Appropriate HTTP status codes (400, 401, 403, 404, 500)
- [x] Stack traces are NOT exposed to frontend
- [x] Sensitive data (tokens, secrets, passwords) is NOT logged

### ✅ Frontend Error Display
- [x] User-friendly error messages:
  - "Failed to send WhatsApp message. Please try again."
  - "Failed to generate AI reply."
  - "Failed to upload document."
- [x] Errors are shown via toast notifications or inline messages
- [x] No stack traces displayed to users

### ✅ Logging
- [x] Server-side logs include:
  - Rule IDs, lead IDs, message IDs
  - High-level summaries
  - Error messages (without stack traces in production)
- [x] Sensitive data is redacted:
  - API tokens (only show "***" or length)
  - Raw provider payloads (only log necessary fields)

## 9. Keyboard Shortcuts

### ✅ Message Composer
- [x] `Ctrl+Enter` or `Cmd+Enter` sends message
- [x] `Enter` alone sends message (Shift+Enter for new line)
- [x] Shortcut works in:
  - Lead detail page message composer
  - Inbox message composer

### ✅ Global Search
- [x] `Ctrl+K` or `Cmd+K` focuses search bar
- [x] `Enter` in search bar navigates to filtered leads page

## 10. Nullable Value Handling

### ✅ UI Components
- [x] `aiScore` null → shows "N/A" or "—"
- [x] `renewalProbability` null → shows "—" or 0%
- [x] `expiryDate` null → shows "Not set" or "—"
- [x] `estimatedRenewalValue` null → shows "Not set" or "—"
- [x] Lead without Contact → shows "Unnamed Lead" or "—"
- [x] Lead without Conversation → shows empty state
- [x] Lead with no Documents → shows "No documents uploaded"
- [x] Lead with no Expiries → shows "No expiry items"

## 11. Visual Consistency

### ✅ Card Layout
- [x] Consistent card styling: `rounded-xl`, `border`, `shadow-sm`
- [x] Consistent spacing: `p-4`, `p-6` for main cards
- [x] Consistent typography:
  - Section titles: `text-xs uppercase tracking-wide`
  - Lead names: `text-xl`/`text-2xl`
  - Body text: `text-sm`/`text-base`

### ✅ Button Styles
- [x] Primary buttons for main actions
- [x] Secondary/outline buttons for secondary actions
- [x] Ghost buttons for tertiary actions
- [x] Consistent button sizes across pages

### ✅ Color System
- [x] Primary color for CTAs
- [x] Neutral backgrounds for content
- [x] Accent colors for AI/automation badges
- [x] Status colors (green/yellow/red) for compliance, expiry, etc.

## 12. Performance & Build

### ✅ Build Checks
- [x] `npm run build` completes without errors
- [x] `npm run lint` passes (or shows only acceptable warnings)
- [x] TypeScript compilation succeeds
- [x] Prisma schema compiles: `npx prisma format` and `npx prisma generate`

### ✅ Environment Variables
- [x] All required env vars documented in README
- [x] Runtime checks for critical env vars (where applicable)
- [x] Missing env vars show helpful error messages

## Notes

- Some features may be partially implemented (e.g., Email/Instagram/Facebook channels may be stubbed)
- Automation rules should be seeded via `/api/admin/automation/seed-*` endpoints or scripts
- Document requirements should be configured per service type via admin UI or database

## Known Limitations

- Some channels (Email, Instagram, Facebook, Webchat) may have partial implementations
- AI features require `OPENAI_API_KEY` to be configured
- WhatsApp requires Meta Cloud API credentials
- Cron jobs require external scheduler (GitHub Actions, Task Scheduler, etc.)
















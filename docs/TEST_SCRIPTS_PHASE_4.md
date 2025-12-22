# PHASE 4: CORE FEATURE VERIFICATION - TEST SCRIPTS

**Objective**: Systematically test all core features to ensure they work end-to-end.

---

## 📋 TEST SCRIPT 4.1: Authentication Flow

### Prerequisites
- Dev server running (`npm run dev`)
- Browser open to http://localhost:3000
- No user logged in

### Test Steps

#### 4.1.1: Test Logout (if logged in)
- [ ] If logged in, click "Logout" button
- [ ] **Expected**: Redirected to `/login` page
- [ ] **Expected**: Cannot access protected routes

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

#### 4.1.2: Test Protected Routes (Unauthenticated)
Test each route in a new incognito/private window:

- [ ] Navigate to: `http://localhost:3000/`
  - **Expected**: Redirected to `/login`
  - **Actual**: _______________
  
- [ ] Navigate to: `http://localhost:3000/leads`
  - **Expected**: Redirected to `/login`
  - **Actual**: _______________
  
- [ ] Navigate to: `http://localhost:3000/renewals`
  - **Expected**: Redirected to `/login`
  - **Actual**: _______________
  
- [ ] Navigate to: `http://localhost:3000/admin/users`
  - **Expected**: Redirected to `/login`
  - **Actual**: _______________
  
- [ ] Navigate to: `http://localhost:3000/inbox`
  - **Expected**: Redirected to `/login`
  - **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.1.3: Test Login
- [ ] Go to `http://localhost:3000/login`
- [ ] Enter email: `admin@example.com` (or your admin email)
- [ ] Enter password: `CHANGE_ME` (or your admin password)
- [ ] Click "Login" button
- [ ] **Expected**: Redirected to dashboard (`/`)
- [ ] **Expected**: Page loads without errors
- [ ] **Expected**: User menu shows logged-in user

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.1.4: Test Session Persistence
- [ ] After login, refresh page (F5)
  - **Expected**: Still logged in, not redirected to login
  - **Actual**: _______________
  
- [ ] Close browser tab, reopen, navigate to `http://localhost:3000/`
  - **Expected**: Still logged in (cookie not expired)
  - **Actual**: _______________
  
- [ ] Check DevTools → Application → Cookies
  - **Expected**: Session cookie exists (`auth-token` or similar)
  - **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.1.5: Test Role-Based Access

**As ADMIN user:**
- [ ] Navigate to `/admin/users`
  - **Expected**: Page loads successfully
  - **Actual**: _______________
  
- [ ] Navigate to `/renewals`
  - **Expected**: Page loads successfully
  - **Actual**: _______________
  
- [ ] Navigate to `/automation`
  - **Expected**: Page loads successfully
  - **Actual**: _______________

**As REGULAR USER (if possible):**
- [ ] Login as regular user (create one if needed)
- [ ] Navigate to `/admin/users`
  - **Expected**: 403 error or redirect to unauthorized page
  - **Actual**: _______________
  
- [ ] Navigate to `/renewals`
  - **Expected**: May work if allowed, or show 403
  - **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 4.2: Lead Management Flow

### Prerequisites
- Logged in as admin
- Navigate to `/leads`

### Test Steps

#### 4.2.1: Test Leads List Loads
- [ ] Navigate to `/leads`
- [ ] **Expected**: Leads list displays
- [ ] **Expected**: Filters visible (Stage, Status, Search)
- [ ] **Expected**: "New Lead" button visible
- [ ] **Expected**: No console errors

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.2.2: Test Create New Lead
- [ ] Click "New Lead" button
- [ ] Fill required fields:
  - Phone: `+971501234567`
  - Service Type: Select "Business Setup" (or any available)
- [ ] Fill optional fields:
  - Name: `Test Lead - Phase 4`
  - Email: `test-phase4@example.com`
- [ ] Click "Create" or "Save" button
- [ ] **Expected**: Success message or redirect to lead detail
- [ ] **Expected**: Lead appears in leads list
- [ ] **Expected**: Lead has default stage "NEW"
- [ ] **Expected**: Lead ID is assigned

**Verify in Database (optional):**
```sql
SELECT * FROM Lead WHERE email = 'test-phase4@example.com' ORDER BY createdAt DESC LIMIT 1;
```

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.2.3: Test Edit Lead
- [ ] Click on the lead created above (or any existing lead)
- [ ] **Expected**: Lead detail page loads
- [ ] Change stage using dropdown (e.g., NEW → CONTACTED)
- [ ] **Expected**: Stage updates immediately (no page reload needed)
- [ ] Refresh page (F5)
- [ ] **Expected**: Stage change persisted

**Verify in Database:**
```sql
SELECT id, stage, updatedAt FROM Lead WHERE id = <leadId>;
-- Stage should match what you selected
```

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.2.4: Test Filters
- [ ] **Filter by Stage**:
  - Select "Contacted" from Stage dropdown
  - **Expected**: Only contacted leads show
  - **Actual**: _______________
  
- [ ] **Filter by Status**:
  - Select "Active" from Status dropdown
  - **Expected**: Filter applies correctly
  - **Actual**: _______________
  
- [ ] **Search by Name**:
  - Type "Test" in search box
  - **Expected**: Matching leads show (name contains "Test")
  - **Actual**: _______________
  
- [ ] **Search by Phone**:
  - Type phone number (e.g., "501234567")
  - **Expected**: Matching lead shows
  - **Actual**: _______________
  
- [ ] **Clear Filters**:
  - Clear search box, select "All" for filters
  - **Expected**: All leads show again
  - **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.2.5: Test Lead Detail Page
- [ ] Click on any lead
- [ ] **Expected**: Lead detail page loads
- [ ] Check all sections load:
  - [ ] Lead info section
  - [ ] Tasks section
  - [ ] Documents section
  - [ ] Messages/Conversation section
  - [ ] Expiry items section (if applicable)
  - [ ] AI Score section
  - [ ] Activity timeline
- [ ] **Expected**: All sections visible, no errors

**Test Send Message:**
- [ ] Go to Messages tab
- [ ] Type a test message
- [ ] Click "Send"
- [ ] **Expected**: Message appears in thread
- [ ] **Expected**: Message status shows (Sending... → Sent)

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 4.3: Inbox/Conversation Flow

### Prerequisites
- Logged in as admin
- Navigate to `/inbox`

### Test Steps

#### 4.3.1: Test Inbox Page Loads
- [ ] Navigate to `/inbox`
- [ ] **Expected**: Page loads without errors
- [ ] **Expected**: Conversations list visible on left
- [ ] **Expected**: Search bar visible
- [ ] **Expected**: Channel tabs visible (if any)

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.3.2: Test Open Conversation
- [ ] Click on any conversation in the list
- [ ] **Expected**: Message thread loads in right panel
- [ ] **Expected**: Messages display in chronological order
- [ ] **Expected**: Inbound vs outbound messages visually distinct
- [ ] **Expected**: Latest message visible (scrolls to bottom)

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.3.3: Test Send Message (if WhatsApp configured)
**Note**: Only test if WhatsApp integration is configured

- [ ] Open a conversation
- [ ] Type message in composer: `Test message from Phase 4 testing`
- [ ] Click "Send" button
- [ ] **Expected**: Message appears in thread immediately
- [ ] **Expected**: Message shows "Sending..." status
- [ ] **Expected**: Status updates to "Sent" (or "Delivered" if API provides)
- [ ] **Expected**: Message persists after page refresh

**Check Console:**
- [ ] Open DevTools Console
- [ ] **Expected**: No errors
- [ ] **Expected**: API call to `/api/inbox/[contactId]/message` succeeds

**Result**: ⬜ PASS / ⬜ FAIL / ⬜ SKIPPED (WhatsApp not configured)  
**Issues Found**: _______________________________

---

#### 4.3.4: Test Channel Tabs
- [ ] If multiple channels exist, click different channel tabs:
  - [ ] WhatsApp tab
  - [ ] Email tab
  - [ ] Instagram tab (if exists)
  - [ ] Facebook tab (if exists)
- [ ] **Expected**: Only messages for selected channel show
- [ ] **Expected**: Empty states show if no messages for channel

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 4.4: Dashboard Data Accuracy

### Prerequisites
- Logged in as admin
- Navigate to `/` (Dashboard)

### Test Steps

#### 4.4.1: Test Dashboard Loads
- [ ] Navigate to `/`
- [ ] **Expected**: Page loads without errors
- [ ] **Expected**: All 4 KPI cards show numbers
- [ ] **Expected**: Recent renewals widget visible
- [ ] **Expected**: Pipeline widget visible
- [ ] **Expected**: No console errors

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.4.2: Verify KPI Cards Match Database

**Check Total Leads:**
- [ ] Dashboard shows: _______________
- [ ] Run database query:
  ```sql
  SELECT COUNT(*) as total FROM Lead;
  ```
- [ ] Database count: _______________
- [ ] **Match**: ⬜ YES / ⬜ NO

**Check Follow-ups Today:**
- [ ] Dashboard shows: _______________
- [ ] Run database query:
  ```sql
  SELECT COUNT(*) as today FROM Task 
  WHERE date(dueDate) = date('now');
  ```
- [ ] Database count: _______________
- [ ] **Match**: ⬜ YES / ⬜ NO

**Check Renewals (90d):**
- [ ] Dashboard shows: _______________
- [ ] Run database query:
  ```sql
  SELECT COUNT(*) as renewals FROM ExpiryItem 
  WHERE expiryDate BETWEEN date('now') AND date('now', '+90 days')
  AND renewalStatus = 'PENDING';
  ```
- [ ] Database count: _______________
- [ ] **Match**: ⬜ YES / ⬜ NO

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.4.3: Verify Recent Renewals Widget
- [ ] Check "Recent Renewals" widget (if visible)
- [ ] **Expected**: Shows actual expiry items
- [ ] Click on a renewal item
  - **Expected**: Links to lead detail page
- [ ] Check dates displayed
  - **Expected**: Dates are in the future (not past)
  - **Expected**: "X days left" calculation is correct
- [ ] Check amounts displayed (if shown)
  - **Expected**: Amounts match database values

**Verify in Database:**
```sql
SELECT ei.*, l.id as leadId, c.fullName 
FROM ExpiryItem ei
LEFT JOIN Lead l ON ei.leadId = l.id
LEFT JOIN Contact c ON ei.contactId = c.id
WHERE ei.expiryDate BETWEEN date('now') AND date('now', '+90 days')
ORDER BY ei.expiryDate ASC
LIMIT 5;
```

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 4.4.4: Verify Pipeline Widget
- [ ] Check "Pipeline" widget
- [ ] **Expected**: Shows stage counts
- [ ] Verify stage counts match database:

**Run Database Query:**
```sql
SELECT stage, COUNT(*) as count FROM Lead GROUP BY stage;
```

**Compare:**
- [ ] NEW: Dashboard = _______, Database = _______
- [ ] CONTACTED: Dashboard = _______, Database = _______
- [ ] ENGAGED: Dashboard = _______, Database = _______
- [ ] QUALIFIED: Dashboard = _______, Database = _______
- [ ] PROPOSAL_SENT: Dashboard = _______, Database = _______
- [ ] IN_PROGRESS: Dashboard = _______, Database = _______
- [ ] COMPLETED_WON: Dashboard = _______, Database = _______
- [ ] LOST: Dashboard = _______, Database = _______

- [ ] Click on a stage in pipeline widget
  - **Expected**: Filters leads list by that stage
  - **Expected**: Redirects to `/leads?stage=...`

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📊 PHASE 4 TEST SUMMARY

### Overall Results

| Test Script | Status | Issues Found |
|------------|--------|--------------|
| 4.1 Authentication Flow | ⬜ PASS / ⬜ FAIL | |
| 4.2 Lead Management Flow | ⬜ PASS / ⬜ FAIL | |
| 4.3 Inbox/Conversation Flow | ⬜ PASS / ⬜ FAIL | |
| 4.4 Dashboard Data Accuracy | ⬜ PASS / ⬜ FAIL | |

**Total Tests**: _____  
**Passed**: _____  
**Failed**: _____  
**Skipped**: _____

### Critical Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Next Steps
- [ ] Fix critical issues before proceeding
- [ ] Retest failed scenarios
- [ ] Proceed to Phase 5

---

**Tested By**: _______________  
**Date**: _______________  
**Time**: _______________

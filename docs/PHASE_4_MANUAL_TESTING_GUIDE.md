# PHASE 4: MANUAL TESTING GUIDE

**For scenarios that require manual browser testing due to automation limitations**

---

## ✅ VERIFIED VIA AUTOMATION/API

### Authentication Backend
- ✅ Admin user exists (`admin@alainbcenter.com`)
- ✅ Login API endpoint works (`POST /api/auth/login`)
- ✅ Returns 200 OK with redirect
- ✅ Session cookie set correctly

---

## 📋 MANUAL TESTING CHECKLIST

### 4.1.3: Test Login (UI)
1. Open browser: `http://localhost:3000/login`
2. Enter email: `admin@alainbcenter.com`
3. Enter password: `CHANGE_ME`
4. Click "Sign in" button
5. **Expected**: Redirected to dashboard (`/`)
6. **Expected**: No error messages
7. **Expected**: Dashboard loads successfully

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

### 4.1.4: Test Session Persistence
1. After successful login, refresh page (F5)
   - **Expected**: Still logged in, not redirected to login
2. Close browser tab, reopen, navigate to `http://localhost:3000/`
   - **Expected**: Still logged in
3. Check DevTools → Application → Cookies
   - **Expected**: Session cookie exists (`auth-token` or similar)

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

### 4.1.5: Test Role-Based Access
**As ADMIN user:**
1. Navigate to `/admin/users`
   - **Expected**: Page loads successfully
2. Navigate to `/renewals`
   - **Expected**: Page loads successfully
3. Navigate to `/automation`
   - **Expected**: Page loads successfully

**As REGULAR USER** (if possible):
1. Login as regular user (create one if needed)
2. Navigate to `/admin/users`
   - **Expected**: 403 error or redirect to unauthorized page

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

### 4.2: Lead Management Flow

#### 4.2.1: Test Leads List Loads
1. Navigate to `/leads`
   - **Expected**: Leads list displays
   - **Expected**: Filters visible (Stage, Status, Search)
   - **Expected**: "New Lead" button visible
   - **Expected**: No console errors

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.2.2: Test Create New Lead
1. Click "New Lead" button
2. Fill required fields:
   - Phone: `+971501234567`
   - Service Type: Select "Business Setup" (or any available)
3. Fill optional fields:
   - Name: `Test Lead - Phase 4`
   - Email: `test-phase4@example.com`
4. Click "Create" or "Save" button
5. **Expected**: Success message or redirect to lead detail
6. **Expected**: Lead appears in leads list
7. **Expected**: Lead has default stage "NEW"

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.2.3: Test Edit Lead
1. Click on the lead created above (or any existing lead)
2. **Expected**: Lead detail page loads
3. Change stage using dropdown (e.g., NEW → CONTACTED)
4. **Expected**: Stage updates immediately (no page reload needed)
5. Refresh page (F5)
6. **Expected**: Stage change persisted

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.2.4: Test Filters
1. **Filter by Stage**: Select "Contacted" from Stage dropdown
   - **Expected**: Only contacted leads show
2. **Search by Name**: Type "Test" in search box
   - **Expected**: Matching leads show
3. **Clear Filters**: Clear search box, select "All"
   - **Expected**: All leads show again

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

### 4.3: Inbox/Conversation Flow

#### 4.3.1: Test Inbox Page Loads
1. Navigate to `/inbox`
2. **Expected**: Page loads without errors
3. **Expected**: Conversations list visible on left
4. **Expected**: Search bar visible

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.3.2: Test Open Conversation
1. Click on any conversation in the list
2. **Expected**: Message thread loads in right panel
3. **Expected**: Messages display in chronological order
4. **Expected**: Latest message visible

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.3.3: Test Send Message (if WhatsApp configured)
1. Open a conversation
2. Type message: `Test message from Phase 4 testing`
3. Click "Send" button
4. **Expected**: Message appears in thread immediately
5. **Expected**: Message shows "Sending..." then "Sent" status

**Result**: ⬜ PASS / ⬜ FAIL / ⬜ SKIPPED (WhatsApp not configured)  
**Notes**: _______________________________

---

### 4.4: Dashboard Data Accuracy

#### 4.4.1: Test Dashboard Loads
1. Navigate to `/` (Dashboard)
2. **Expected**: Page loads without errors
3. **Expected**: All 4 KPI cards show numbers
4. **Expected**: Recent renewals widget visible
5. **Expected**: Pipeline widget visible
6. **Expected**: No console errors

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

#### 4.4.2: Verify KPI Cards Match Database

**Check Total Leads:**
- Dashboard shows: _______
- Run: `SELECT COUNT(*) as total FROM Lead;`
- Database count: _______
- **Match**: ⬜ YES / ⬜ NO

**Check Follow-ups Today:**
- Dashboard shows: _______
- Run: `SELECT COUNT(*) as today FROM Task WHERE date(dueDate) = date('now');`
- Database count: _______
- **Match**: ⬜ YES / ⬜ NO

**Check Renewals (90d):**
- Dashboard shows: _______
- Run: `SELECT COUNT(*) as renewals FROM ExpiryItem WHERE expiryDate BETWEEN date('now') AND date('now', '+90 days') AND renewalStatus = 'PENDING';`
- Database count: _______
- **Match**: ⬜ YES / ⬜ NO

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

## 📊 TEST EXECUTION SUMMARY

Fill this out as you complete manual tests:

| Test | Status | Notes |
|------|--------|-------|
| Login UI | ⬜ | |
| Session Persistence | ⬜ | |
| Role-Based Access | ⬜ | |
| Leads List | ⬜ | |
| Create Lead | ⬜ | |
| Edit Lead | ⬜ | |
| Filter Leads | ⬜ | |
| Inbox Loads | ⬜ | |
| Open Conversation | ⬜ | |
| Send Message | ⬜ | |
| Dashboard Loads | ⬜ | |
| Dashboard Data Accuracy | ⬜ | |

---

**Use this guide alongside automated test results for complete Phase 4 coverage.**


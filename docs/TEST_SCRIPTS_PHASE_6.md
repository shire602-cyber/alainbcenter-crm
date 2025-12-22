# PHASE 6: ERROR HANDLING & EDGE CASES - TEST SCRIPTS

**Objective**: Verify graceful error handling and edge case scenarios don't break the application.

---

## 📋 TEST SCRIPT 6.1: Test Error Scenarios

### Prerequisites
- Logged in as admin
- Browser DevTools open (F12)
- Network tab open

---

### 6.1.1: API Error Handling (Network Disconnect)

#### Setup
- [ ] Open DevTools → Network tab
- [ ] Enable "Offline" mode (or disconnect internet)

#### Test Steps
- [ ] Navigate to `/leads`
- [ ] Try to create a new lead:
  - Click "New Lead"
  - Fill required fields
  - Click "Create"
- [ ] **Expected**: User-friendly error message shown
- [ ] **Expected**: Page doesn't crash (white screen)
- [ ] **Expected**: Error message is readable and helpful
- [ ] **Actual**: _______________

**Reconnect Network:**
- [ ] Disable "Offline" mode (reconnect internet)
- [ ] Try creating lead again
- [ ] **Expected**: Page still works
- [ ] **Expected**: Lead creation succeeds

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.1.2: Empty States

#### Test with Empty Database (Optional)
**⚠️ WARNING**: Only test this if you have a backup or test database

- [ ] Create fresh database OR backup current data
- [ ] Delete all leads (if testing):
  ```sql
  DELETE FROM Lead;
  ```
- [ ] Navigate to `/leads`
- [ ] **Expected**: Empty state shows helpful message
- [ ] **Expected**: "Create Lead" button visible
- [ ] **Expected**: No console errors
- [ ] **Expected**: Page doesn't crash

**Test Empty Inbox:**
- [ ] Navigate to `/inbox`
- [ ] **Expected**: Empty state shows (if no conversations)
- [ ] **Expected**: Helpful message about no conversations

**Test Empty Renewals:**
- [ ] Navigate to `/renewals`
- [ ] **Expected**: Empty state shows (if no expiries)
- [ ] **Expected**: Helpful message

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.1.3: Invalid Data Validation

#### Test Invalid Phone Number
- [ ] Navigate to `/leads`
- [ ] Click "New Lead"
- [ ] Enter phone: `abc` (invalid)
- [ ] Fill other required fields
- [ ] Click "Create"
- [ ] **Expected**: Validation error shows
- [ ] **Expected**: Form doesn't submit
- [ ] **Expected**: Error message is clear
- [ ] **Actual**: _______________

#### Test Missing Required Fields
- [ ] Click "New Lead"
- [ ] Leave phone field empty
- [ ] Leave service type empty
- [ ] Click "Create"
- [ ] **Expected**: Validation errors show for missing fields
- [ ] **Expected**: Form doesn't submit
- [ ] **Expected**: Error messages point to specific fields

#### Test Invalid Email Format
- [ ] In lead creation form, enter email: `not-an-email`
- [ ] Fill other required fields
- [ ] Click "Create"
- [ ] **Expected**: Email validation error (if email validation exists)
- [ ] **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.1.4: Permission Errors

#### Test as Regular User (if possible)
**Setup:**
- [ ] Create a regular user (role = 'AGENT' or 'USER'):
  ```sql
  INSERT INTO User (email, password, role, name)
  VALUES ('testuser@example.com', '$2a$10$...', 'USER', 'Test User');
  ```
- [ ] Logout as admin
- [ ] Login as regular user

#### Test Admin Route Access
- [ ] Try to access: `http://localhost:3000/admin/users`
  - **Expected**: 403 error or redirect to unauthorized page
  - **Expected**: Helpful error message
  - **Actual**: _______________
  
- [ ] Try to access: `http://localhost:3000/admin/services`
  - **Expected**: 403 error or redirect
  - **Actual**: _______________

- [ ] Try to access: `http://localhost:3000/automation`
  - **Expected**: 403 error or redirect (if admin-only)
  - **Actual**: _______________

#### Test API Permission Errors
- [ ] Open DevTools Console
- [ ] Try to call admin API directly:
  ```javascript
  fetch('/api/admin/users', { method: 'POST', body: JSON.stringify({}) })
    .then(r => r.json())
    .then(console.log)
  ```
- [ ] **Expected**: Returns 403 error
- [ ] **Expected**: Error message in response

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.1.5: 404 Errors

#### Test Non-Existent Page
- [ ] Navigate to: `http://localhost:3000/non-existent-page`
- [ ] **Expected**: 404 page shows (not white screen)
- [ ] **Expected**: Helpful message like "Page not found"
- [ ] **Expected**: Link back to home or navigation
- [ ] **Expected**: Can navigate back

#### Test Non-Existent Lead
- [ ] Navigate to: `http://localhost:3000/leads/999999`
  (assuming lead with ID 999999 doesn't exist)
- [ ] **Expected**: 404 page or "Lead not found" message
- [ ] **Expected**: Not a white screen or error page

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.1.6: Server Error Handling

#### Test Invalid API Request
- [ ] Open DevTools Console
- [ ] Try invalid API call:
  ```javascript
  fetch('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invalid: 'data' })
  })
    .then(r => r.json())
    .then(console.log)
    .catch(console.error)
  ```
- [ ] **Expected**: Returns 400 or 500 error with error message
- [ ] **Expected**: Error message is user-friendly (not stack trace in production)
- [ ] **Expected**: Console shows error details (for debugging)

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 6.2: Browser Console Cleanup

### Prerequisites
- Browser DevTools open (F12)
- Console tab open
- All pages accessible

---

### 6.2.1: Dashboard Console Check

#### Test Steps
- [ ] Navigate to `/` (Dashboard)
- [ ] Check Console tab:
  - [ ] **Red Errors**: Count = _______
  - [ ] **Yellow Warnings**: Count = _______
  - [ ] **Blue Info**: Count = _______

#### Fix Red Errors
**Common Errors to Look For:**
- [ ] Missing imports
- [ ] Undefined variables
- [ ] Type errors
- [ ] API call failures
- [ ] Component errors

**List Errors Found:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.2: Leads Page Console Check
- [ ] Navigate to `/leads`
- [ ] Check Console:
  - [ ] Red Errors: _______
  - [ ] Critical Warnings: _______
- [ ] **Expected**: No red errors
- [ ] **Actual**: _______________

**Common Issues:**
- [ ] Missing `key` props in list items
- [ ] React warnings about hooks
- [ ] Prop type warnings

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.3: Renewals Page Console Check
- [ ] Navigate to `/renewals`
- [ ] Check Console:
  - [ ] Red Errors: _______
  - [ ] Warnings: _______
- [ ] Click "Dry Run" button
- [ ] Check Console after click:
  - [ ] Any new errors: ⬜ YES / ⬜ NO
  - [ ] API call errors: ⬜ YES / ⬜ NO

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.4: Inbox Page Console Check
- [ ] Navigate to `/inbox`
- [ ] Check Console:
  - [ ] Red Errors: _______
- [ ] Click on a conversation
- [ ] Check Console:
  - [ ] Any new errors: ⬜ YES / ⬜ NO

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.5: Admin Pages Console Check
- [ ] Navigate to `/admin/users`
- [ ] Check Console:
  - [ ] Red Errors: _______
  
- [ ] Navigate to `/admin/services`
- [ ] Check Console:
  - [ ] Red Errors: _______

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.6: Fix Common Console Issues

#### Missing `key` Props
**Find:**
```typescript
// BAD:
{items.map(item => <div>{item.name}</div>)}

// GOOD:
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

**Files to Check:**
- [ ] All `.map()` calls have `key` prop
- [ ] Keys are unique
- [ ] Keys don't use array index (unless list is static)

#### Hydration Mismatches
**Common Causes:**
- Server/client rendering differences
- Using `Date.now()` or `Math.random()` in render
- Browser-only code in SSR

**Check For:**
- [ ] React hydration warnings in console
- [ ] Different content on server vs client

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 6.2.7: React Warnings Check

#### useEffect Dependencies
**Common Warning:**
```
React Hook useEffect has a missing dependency: 'userId'
```

**Check:**
- [ ] All `useEffect` hooks have correct dependencies
- [ ] No exhaustive-deps warnings

**Files to Review:**
- [ ] `src/app/renewals/RenewalsDashboard.tsx`
- [ ] `src/app/leads/page.tsx`
- [ ] `src/app/inbox/page.tsx`
- [ ] Other client components with useEffect

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📊 PHASE 6 TEST SUMMARY

### Overall Results

| Test Script | Status | Issues Found |
|------------|--------|--------------|
| 6.1 Error Scenarios | ⬜ PASS / ⬜ FAIL | |
| 6.2 Console Cleanup | ⬜ PASS / ⬜ FAIL | |

**Total Tests**: _____  
**Passed**: _____  
**Failed**: _____  
**Skipped**: _____

### Error Handling Summary

**Network Errors:**
- Handles gracefully: ⬜ YES / ⬜ NO
- User-friendly messages: ⬜ YES / ⬜ NO

**Validation Errors:**
- Shows clear messages: ⬜ YES / ⬜ NO
- Prevents invalid submissions: ⬜ YES / ⬜ NO

**Permission Errors:**
- Properly blocked: ⬜ YES / ⬜ NO
- Clear error messages: ⬜ YES / ⬜ NO

**Console Errors:**
- Red errors: _______
- Critical warnings: _______
- Fixed: _______

### Critical Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Next Steps
- [ ] Fix all red console errors
- [ ] Fix critical warnings
- [ ] Retest error scenarios
- [ ] Proceed to Phase 7

---

**Tested By**: _______________  
**Date**: _______________  
**Time**: _______________

---

## 🔧 Common Console Error Fixes

### Fix Missing `key` Prop
```typescript
// Find this pattern:
{items.map((item, idx) => <Component {...item} />)}

// Fix to:
{items.map((item, idx) => <Component key={item.id || idx} {...item} />)}
```

### Fix useEffect Dependencies
```typescript
// BAD:
useEffect(() => {
  fetchData(userId);
}, []); // Missing userId

// GOOD:
useEffect(() => {
  fetchData(userId);
}, [userId]); // Include all dependencies
```

### Fix Hydration Mismatch
```typescript
// BAD:
const now = new Date().toISOString(); // Different on server/client

// GOOD:
const [now, setNow] = useState('');
useEffect(() => {
  setNow(new Date().toISOString());
}, []); // Client-side only
```


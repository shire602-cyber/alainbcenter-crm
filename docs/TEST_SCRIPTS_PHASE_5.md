# PHASE 5: DATA INTEGRITY & SEEDING - TEST SCRIPTS

**Objective**: Verify data integrity, seed default data, and ensure database is properly configured.

---

## 📋 TEST SCRIPT 5.1: Run Prisma Generate

### When to Run
- After schema changes
- If TypeScript errors about Prisma types
- If getting "Model not found" errors

### Test Steps

#### 5.1.1: Check for Prisma Type Errors
- [ ] Open terminal in project directory
- [ ] Check for TypeScript compilation errors:
  ```powershell
  npx tsc --noEmit
  ```
- [ ] **Expected**: No errors related to Prisma types
- [ ] **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

#### 5.1.2: Run Prisma Generate
- [ ] Run command:
  ```powershell
  npx prisma generate
  ```
- [ ] **Expected**: Command completes without errors
- [ ] **Expected**: Output shows "Generated Prisma Client"
- [ ] **Expected**: No red error messages

**Check Output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
✔ Generated Prisma Client (x.xx.x) to .\node_modules\.prisma\client in xxxms
```

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.1.3: Verify Prisma Client Generated
- [ ] Check if Prisma client exists:
  ```powershell
  Test-Path node_modules\.prisma\client
  ```
- [ ] **Expected**: Returns `True`
- [ ] **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

## 📋 TEST SCRIPT 5.2: Seed Document Requirements

### When to Run
- First time setup
- After adding new service types
- If document requirements missing

### Test Steps

#### 5.2.1: Check Current Document Requirements
- [ ] Run database query:
  ```sql
  SELECT * FROM ServiceDocumentRequirement;
  ```
- [ ] Count existing requirements: _______

**Result**: ⬜ Requirements exist / ⬜ No requirements

---

#### 5.2.2: Run Seed Script
- [ ] Run command:
  ```powershell
  npx ts-node scripts/seed-document-requirements.ts
  ```
- [ ] **Expected**: Script completes without errors
- [ ] **Expected**: Output shows requirements created/updated
- [ ] **Expected**: No error messages

**Check Output:**
- [ ] Should show: "Document requirements seeded successfully"
- [ ] Should list created requirements

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.2.3: Verify Requirements Created
- [ ] Run database query:
  ```sql
  SELECT 
    sdr.id,
    sdr.serviceType,
    sdr.documentCategory,
    sdr.isRequired,
    st.name as serviceName
  FROM ServiceDocumentRequirement sdr
  LEFT JOIN ServiceType st ON sdr.serviceType = st.code
  ORDER BY sdr.serviceType, sdr.documentCategory;
  ```
- [ ] **Expected**: Requirements exist for each service type
- [ ] **Expected**: Categories match expected types (PASSPORT, VISA, etc.)
- [ ] **Expected**: `isRequired` flags set correctly

**Count Requirements:**
- [ ] Total requirements: _______
- [ ] Service types covered: _______

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.2.4: Test Requirements in UI
- [ ] Navigate to a lead with a service type set
- [ ] Go to Documents section
- [ ] **Expected**: Document checklist shows based on service type
- [ ] **Expected**: Required documents marked as required
- [ ] **Expected**: Checklist updates when documents uploaded

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 5.3: Seed Automation Rules

### When to Run
- First time setup
- To reset to default rules
- If automation rules missing

### Test Steps

#### 5.3.1: Check Current Automation Rules
- [ ] Run database query:
  ```sql
  SELECT id, ruleKey, triggerType, actionType, enabled, isActive 
  FROM AutomationRule 
  ORDER BY triggerType, actionType;
  ```
- [ ] Count existing rules: _______
- [ ] Active rules: _______

**Result**: ⬜ Rules exist / ⬜ No rules

---

#### 5.3.2: Run Seed Script
- [ ] Run command:
  ```powershell
  npx ts-node scripts/seed-automation-rules-inbound.ts
  ```
- [ ] **Expected**: Script completes without errors
- [ ] **Expected**: Output shows rules created/updated
- [ ] **Expected**: No error messages

**Check Output:**
- [ ] Should show: "Automation rules seeded successfully"
- [ ] Should list created rules

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.3.3: Verify Rules Created
- [ ] Run database query:
  ```sql
  SELECT 
    id,
    ruleKey,
    triggerType,
    actionType,
    enabled,
    isActive,
    name
  FROM AutomationRule
  WHERE enabled = true AND isActive = true
  ORDER BY triggerType;
  ```
- [ ] **Expected**: Default rules exist
- [ ] **Expected**: Rules are enabled and active
- [ ] **Expected**: Trigger types include: INBOUND_MESSAGE, EXPIRY_WINDOW, etc.

**Verify Specific Rules:**
- [ ] Inbound message auto-reply rule exists
- [ ] Expiry reminder rules exist (90D, 60D, 30D, 7D)
- [ ] Follow-up rules exist

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.3.4: Test Rules in UI
- [ ] Navigate to `/automation`
- [ ] **Expected**: Rules list displays
- [ ] **Expected**: Default rules visible
- [ ] **Expected**: Rules can be enabled/disabled
- [ ] **Expected**: Rules show correct trigger types and actions

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.3.5: Alternative: Seed via UI Button
- [ ] Navigate to `/automation`
- [ ] Click "Seed Document Rules" button (if exists)
- [ ] **Expected**: Success message shown
- [ ] **Expected**: Page refreshes showing new rules
- [ ] Verify rules appear in list

**Result**: ⬜ PASS / ⬜ FAIL / ⬜ N/A (button not available)  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 5.4: Verify Admin User Exists

### When to Run
- First time setup
- After user management changes
- If login fails

### Test Steps

#### 5.4.1: Run Admin Creation Script
- [ ] Run command:
  ```powershell
  npx tsx scripts/create-admin.ts
  ```
- [ ] **Expected**: Script completes without errors
- [ ] **Expected**: Output shows user created/updated
- [ ] **Expected**: Shows email and role

**Check Output:**
```
✅ Admin user created/updated:
   Email: admin@example.com
   Role: ADMIN
   Password: CHANGE_ME
```

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.4.2: Verify Admin User in Database
- [ ] Run database query:
  ```sql
  SELECT id, email, role, createdAt 
  FROM User 
  WHERE role = 'ADMIN';
  ```
- [ ] **Expected**: At least one user with `role = 'ADMIN'`
- [ ] **Expected**: Email matches expected value
- [ ] Count admin users: _______

**Verify User Details:**
- [ ] Email: _______________
- [ ] Role: _______________
- [ ] Password hash exists: ⬜ YES / ⬜ NO

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.4.3: Test Admin Login
- [ ] Navigate to `/login`
- [ ] Enter admin email: _______________
- [ ] Enter admin password: `CHANGE_ME` (or configured password)
- [ ] Click "Login"
- [ ] **Expected**: Login succeeds
- [ ] **Expected**: Redirected to dashboard
- [ ] **Expected**: Can access admin routes

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

#### 5.4.4: Verify Admin Can Access Protected Routes
- [ ] While logged in as admin, test routes:
  - [ ] `/admin/users` - ⬜ Accessible / ⬜ Blocked
  - [ ] `/admin/services` - ⬜ Accessible / ⬜ Blocked
  - [ ] `/admin/integrations` - ⬜ Accessible / ⬜ Blocked
  - [ ] `/automation` - ⬜ Accessible / ⬜ Blocked
  - [ ] `/renewals` - ⬜ Accessible / ⬜ Blocked

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📊 PHASE 5 TEST SUMMARY

### Overall Results

| Test Script | Status | Issues Found |
|------------|--------|--------------|
| 5.1 Prisma Generate | ⬜ PASS / ⬜ FAIL | |
| 5.2 Seed Document Requirements | ⬜ PASS / ⬜ FAIL | |
| 5.3 Seed Automation Rules | ⬜ PASS / ⬜ FAIL | |
| 5.4 Verify Admin User | ⬜ PASS / ⬜ FAIL | |

**Total Tests**: _____  
**Passed**: _____  
**Failed**: _____  
**Skipped**: _____

### Database Verification Summary

**Document Requirements:**
- Total requirements: _______
- Service types covered: _______

**Automation Rules:**
- Total rules: _______
- Active rules: _______
- Trigger types: _______

**Admin Users:**
- Admin count: _______
- Can login: ⬜ YES / ⬜ NO
- Can access admin routes: ⬜ YES / ⬜ NO

### Critical Issues Found
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Next Steps
- [ ] Fix critical issues before proceeding
- [ ] Retest failed scenarios
- [ ] Proceed to Phase 6

---

**Tested By**: _______________  
**Date**: _______________  
**Time**: _______________

---

## 🔧 Troubleshooting Commands

### Check Prisma Schema
```powershell
cat prisma/schema.prisma
```

### Check Database Connection
```powershell
npx prisma db pull
```

### View Database Structure
```powershell
npx prisma studio
# Opens database viewer in browser
```

### Reset Database (⚠️ DESTRUCTIVE - only in dev)
```powershell
npx prisma migrate reset
# This will delete all data!
```

### Check Service Types
```sql
SELECT * FROM ServiceType WHERE isActive = true;
```

### Check Integration Status
```sql
SELECT name, provider, enabled, configured FROM Integration;
```

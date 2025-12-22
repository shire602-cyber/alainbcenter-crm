# TEST EXECUTION GUIDE

**Quick reference for executing all test phases**

---

## 🚀 QUICK START

### Phase 5: Data Integrity (30 min) - CURRENT

#### Automated Checks (✅ Done)
- [x] Verified Prisma client exists
- [x] Verified seed scripts exist
- [x] Documented current status

#### Manual Steps Required

**1. Run Admin User Creation** (if needed):
```powershell
npx tsx scripts/create-admin.ts
```
**Expected Output:**
```
✅ Admin user created successfully!
   Email: admin@alainbcenter.com
   Password: CHANGE_ME
```

**2. Run Document Requirements Seed** (if needed):
```powershell
npx ts-node scripts/seed-document-requirements.ts
```

**3. Run Automation Rules Seed** (if needed):
```powershell
npx ts-node scripts/seed-automation-rules-inbound.ts
```

**4. Verify Database** (optional):
```powershell
# Use Prisma Studio to inspect database
npx prisma studio
```

#### Notes
- ✅ All scripts verified and ready
- ⚠️ Prisma generate blocked while dev server running (not critical)
- ⬜ Database queries need manual verification

---

## 📋 PHASE 4: Core Features (1-2 hours) - NEXT

### Prerequisites
- [ ] Admin user exists (from Phase 5)
- [ ] Dev server running (`npm run dev`)
- [ ] Browser open with DevTools

### Test Execution Order

#### 4.1 Authentication Flow (15 min)
1. Test logout (if logged in)
2. Test protected routes (incognito window)
3. Test login with credentials
4. Test session persistence
5. Test role-based access

**Login Credentials:**
- Email: `admin@alainbcenter.com` (or from create-admin script)
- Password: `CHANGE_ME`

#### 4.2 Lead Management Flow (30 min)
1. Test leads list loads
2. Test create new lead
3. Test edit lead (change stage)
4. Test filters (stage, status, search)
5. Test lead detail page

#### 4.3 Inbox/Conversation Flow (20 min)
1. Test inbox page loads
2. Test open conversation
3. Test send message (if WhatsApp configured)
4. Test channel tabs
5. Test search conversations

#### 4.4 Dashboard Data Accuracy (15 min)
1. Test dashboard loads
2. Verify KPI cards match database
3. Verify recent renewals widget
4. Verify pipeline widget

### Quick Database Queries for Verification

**Total Leads:**
```sql
SELECT COUNT(*) as total FROM Lead;
```

**Follow-ups Today:**
```sql
SELECT COUNT(*) as today FROM Task 
WHERE date(dueDate) = date('now');
```

**Renewals (90d):**
```sql
SELECT COUNT(*) as renewals FROM ExpiryItem 
WHERE expiryDate BETWEEN date('now') AND date('now', '+90 days')
AND renewalStatus = 'PENDING';
```

**Pipeline Stages:**
```sql
SELECT stage, COUNT(*) as count FROM Lead GROUP BY stage;
```

---

## 📋 PHASE 6: Error Handling (1 hour)

### 6.1 Error Scenarios
- [ ] Test API error handling (network disconnect)
- [ ] Test empty states
- [ ] Test invalid data validation
- [ ] Test permission errors (403)
- [ ] Test 404 errors
- [ ] Test server error handling

### 6.2 Console Cleanup
- [ ] Dashboard console check
- [ ] Leads page console check
- [ ] Renewals page console check
- [ ] Inbox page console check
- [ ] Admin pages console check
- [ ] Fix common issues (missing keys, useEffect deps)

---

## 📋 PHASE 7: Performance (45 min)

### 7.1 Page Load Times
- [ ] Dashboard load time (< 2s target)
- [ ] Leads list load time (< 2s target)
- [ ] Lead detail load time (< 2s target)
- [ ] Renewals page load time (< 2s target)
- [ ] Inbox page load time (< 2s target)
- [ ] Test with network throttling (Fast 3G)

### 7.2 Bundle Size
- [ ] Run production build: `npm run build`
- [ ] Check bundle sizes in output
- [ ] Verify First Load JS < 200 KB
- [ ] Identify large dependencies

---

## 📋 PHASE 8: Final Verification (2 hours)

### Complete Feature Checklist
- [ ] Authentication & Authorization
- [ ] Leads Management
- [ ] Renewals Management
- [ ] Inbox & Conversations
- [ ] Dashboard
- [ ] Automation
- [ ] Admin Pages
- [ ] Reports & Analytics
- [ ] UI/UX Consistency
- [ ] Data Integrity
- [ ] Cross-browser testing

**See:** `docs/TEST_SCRIPTS_PHASE_8.md` for full checklist

---

## 📋 PHASE 9: Documentation (1 hour)

### Create Test Reports
- [ ] Phase 4 results → `docs/TEST_RESULTS_PHASE_4.md`
- [ ] Phase 6 results → `docs/TEST_RESULTS_PHASE_6.md`
- [ ] Phase 7 results → `docs/TEST_RESULTS_PHASE_7.md`
- [ ] Phase 8 results → `docs/TEST_RESULTS_PHASE_8.md`

### Update Status Files
- [ ] Update `docs/NEXT_STEPS.md`
- [ ] Update `docs/QA_CHECKLIST.md`
- [ ] Create final test report

---

## 🔧 TROUBLESHOOTING

### Prisma Generate Fails
**Error**: `EPERM: operation not permitted, unlink`
**Solution**: Stop dev server, run generate, restart server

### Seed Scripts Fail
**Check**: Database connection in `.env`
**Verify**: `DATABASE_URL` is correct

### TypeScript Errors
**Run**: `npx tsc --noEmit`
**Fix**: Address any type errors before proceeding

### Dev Server Won't Start
**Clear cache**: `Remove-Item -Recurse -Force .next`
**Regenerate**: `npx prisma generate`
**Restart**: `npm run dev`

---

## 📊 PROGRESS TRACKING

### Current Status
- [x] Phase 2: UI/UX fixes (Complete)
- [x] Phase 3: Design system (Complete)
- [x] Phase 5: Started (Scripts verified, pending execution)
- [ ] Phase 4: Pending
- [ ] Phase 6: Pending
- [ ] Phase 7: Pending
- [ ] Phase 8: Pending
- [ ] Phase 9: Pending

### Estimated Remaining Time
- Phase 5: 15 min (scripts ready)
- Phase 4: 1-2 hours
- Phase 6: 1 hour
- Phase 7: 45 min
- Phase 8: 2 hours
- Phase 9: 1 hour
- **Total**: ~6-7 hours

---

**Last Updated**: 2025-01-15  
**Next Action**: Execute Phase 5 seed scripts, then proceed to Phase 4


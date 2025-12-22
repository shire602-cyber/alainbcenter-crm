# MASTER TEST SCRIPTS INDEX

**All Test Scripts and Checklists for Phases 2-9**

---

## 📚 Available Test Scripts

### Phase 2: UI/UX Verification & Fixes
- **Status**: ✅ Complete (Code changes done)
- **Document**: See `PHASE_2_3_COMPLETE.md`
- **Focus**: Dark mode visibility, design system consistency

### Phase 3: Design System Application
- **Status**: ✅ Complete (Code changes done)
- **Document**: See `PHASE_2_3_COMPLETE.md`
- **Focus**: Reports, Automation, Admin pages upgraded

### Phase 4: Core Feature Verification
- **Test Script**: `docs/TEST_SCRIPTS_PHASE_4.md`
- **Focus**: Authentication, Leads, Inbox, Dashboard
- **Estimated Time**: 1-2 hours

### Phase 5: Data Integrity & Seeding
- **Test Script**: `docs/TEST_SCRIPTS_PHASE_5.md`
- **Focus**: Prisma, seed scripts, admin user
- **Estimated Time**: 30 minutes

### Phase 6: Error Handling & Edge Cases
- **Test Script**: `docs/TEST_SCRIPTS_PHASE_6.md`
- **Focus**: Error scenarios, console cleanup
- **Estimated Time**: 1 hour

### Phase 7: Performance Check
- **Test Script**: `docs/TEST_SCRIPTS_PHASE_7.md`
- **Focus**: Load times, bundle sizes
- **Estimated Time**: 45 minutes

### Phase 8: Final Verification
- **Test Script**: `docs/TEST_SCRIPTS_PHASE_8.md`
- **Focus**: Complete feature checklist
- **Estimated Time**: 2 hours

### Phase 9: Documentation & Notes
- **Template**: `docs/TEST_SCRIPTS_PHASE_9.md`
- **Focus**: Document findings, update status files
- **Estimated Time**: 1 hour

---

## 🚀 Quick Start Guide

### Step 1: Review Completed Phases
- ✅ Phase 2: UI/UX fixes (code changes complete)
- ✅ Phase 3: Design system upgrades (code changes complete)

### Step 2: Run Remaining Test Phases

**Order of Execution:**
1. **Phase 5** (Quick - 30 min): Ensure data integrity
2. **Phase 4** (Critical - 1-2 hours): Test core features
3. **Phase 6** (Important - 1 hour): Verify error handling
4. **Phase 7** (Optimization - 45 min): Check performance
5. **Phase 8** (Final - 2 hours): Complete verification
6. **Phase 9** (Documentation - 1 hour): Document everything

**Total Estimated Time**: 6-7 hours

---

## 📋 Test Execution Workflow

### Before Starting
1. [ ] Dev server running (`npm run dev`)
2. [ ] Browser open with DevTools
3. [ ] Database accessible
4. [ ] Admin credentials ready

### For Each Phase
1. [ ] Read the test script
2. [ ] Execute each test step
3. [ ] Mark results (PASS/FAIL)
4. [ ] Document issues found
5. [ ] Fix critical issues before proceeding
6. [ ] Mark phase complete

### After All Phases
1. [ ] Create final test report (Phase 9)
2. [ ] Update status files
3. [ ] Get sign-off
4. [ ] Proceed to next development phase

---

## 🎯 Priority Order (If Time Limited)

### Must Do (Critical):
1. **Phase 4.1**: Authentication Flow
2. **Phase 4.2**: Lead Management Flow
3. **Phase 5.4**: Verify Admin User
4. **Phase 6.2**: Console Cleanup (fix errors)

### Should Do (Important):
1. **Phase 4.4**: Dashboard Data Accuracy
2. **Phase 5.2**: Seed Document Requirements
3. **Phase 6.1**: Error Scenarios
4. **Phase 8**: Final Verification

### Nice to Have:
1. **Phase 7**: Performance Check (can optimize later)
2. **Phase 9**: Full Documentation (can document as you go)

---

## 📝 Quick Reference

### Critical Test Scenarios
- ✅ Login/Logout
- ✅ Create Lead
- ✅ Run Renewals Engine
- ✅ Send Message (Inbox)
- ✅ Dashboard Data Accuracy

### Common Issues to Check
- ❌ Console errors
- ❌ Missing `key` props
- ❌ API errors (500, 401, 403)
- ❌ Dark mode visibility
- ❌ Form validation

### Quick Commands
```powershell
# Clear build cache
Remove-Item -Recurse -Force .next

# Regenerate Prisma
npx prisma generate

# Seed data
npx ts-node scripts/seed-document-requirements.ts
npx ts-node scripts/seed-automation-rules-inbound.ts

# Create admin
npx tsx scripts/create-admin.ts
```

---

## 📊 Progress Tracking

### Current Status
- [x] Phase 2: Complete
- [x] Phase 3: Complete
- [ ] Phase 4: Pending
- [ ] Phase 5: Pending
- [ ] Phase 6: Pending
- [ ] Phase 7: Pending
- [ ] Phase 8: Pending
- [ ] Phase 9: Pending

### Last Updated
- **Date**: _______________
- **By**: _______________
- **Next Action**: _______________

---

**Use this index to navigate between test scripts and track overall testing progress.**

# PHASE 7: PERFORMANCE CHECK - TEST SCRIPTS

**Objective**: Measure page load times, identify slow API calls, and check bundle sizes.

---

## 📋 TEST SCRIPT 7.1: Page Load Times

### Prerequisites
- Browser DevTools open (F12)
- Network tab open
- Hard refresh enabled (Ctrl+Shift+R)

### Test Configuration
- **Throttling**: None (for baseline) OR Fast 3G (for realistic)
- **Cache**: Disabled for first test
- **Measurements**: Time to Interactive (TTI) and First Contentful Paint (FCP)

---

### 7.1.1: Dashboard Load Time

#### Test Steps
- [ ] Open DevTools → Network tab
- [ ] Enable "Disable cache" checkbox
- [ ] Clear network log
- [ ] Hard refresh: `Ctrl+Shift+R` on `http://localhost:3000/`
- [ ] **Wait for page to fully load** (all resources loaded)

#### Measurements
- [ ] **Total Load Time**: _______ seconds
- [ ] **First Contentful Paint**: _______ seconds
- [ ] **Time to Interactive**: _______ seconds
- [ ] **DOM Content Loaded**: _______ seconds

#### Target Metrics
- **Total Load Time**: < 2 seconds ⬜ PASS / ⬜ FAIL
- **First Contentful Paint**: < 1 second ⬜ PASS / ⬜ FAIL
- **Time to Interactive**: < 2 seconds ⬜ PASS / ⬜ FAIL

#### API Calls Analysis
- [ ] Number of API calls: _______
- [ ] Slowest API call: _______ (time: _______ ms)
- [ ] Total API response time: _______ ms

**List Slow API Calls (> 500ms):**
1. Endpoint: _______, Time: _______ ms
2. Endpoint: _______, Time: _______ ms
3. Endpoint: _______, Time: _______ ms

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.2: Leads List Load Time

#### Test Steps
- [ ] Navigate to `/leads`
- [ ] Hard refresh: `Ctrl+Shift+R`
- [ ] **Wait for page to fully load**

#### Measurements
- [ ] **Total Load Time**: _______ seconds
- [ ] **First Contentful Paint**: _______ seconds
- [ ] **Time to Interactive**: _______ seconds

#### Target Metrics
- **Total Load Time**: < 2 seconds ⬜ PASS / ⬜ FAIL
- **First Contentful Paint**: < 1 second ⬜ PASS / ⬜ FAIL

#### API Calls Analysis
- [ ] Number of API calls: _______
- [ ] Slowest API call: _______ (time: _______ ms)
- [ ] `/api/leads` response time: _______ ms

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.3: Lead Detail Page Load Time

#### Test Steps
- [ ] Navigate to a lead detail page (e.g., `/leads/1`)
- [ ] Hard refresh: `Ctrl+Shift+R`
- [ ] **Wait for all sections to load**

#### Measurements
- [ ] **Total Load Time**: _______ seconds
- [ ] **First Contentful Paint**: _______ seconds
- [ ] **All sections loaded**: _______ seconds

#### Target Metrics
- **Total Load Time**: < 2 seconds ⬜ PASS / ⬜ FAIL
- **Sections load within**: < 3 seconds ⬜ PASS / ⬜ FAIL

#### API Calls Analysis
- [ ] Number of API calls: _______
- [ ] Slowest API call: _______ (time: _______ ms)
- [ ] Parallel vs sequential loading: ⬜ Parallel / ⬜ Sequential

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.4: Renewals Page Load Time

#### Test Steps
- [ ] Navigate to `/renewals`
- [ ] Hard refresh: `Ctrl+Shift+R`
- [ ] **Wait for page to fully load**

#### Measurements
- [ ] **Total Load Time**: _______ seconds
- [ ] **API response time** (`/api/renewals`): _______ ms

#### Target Metrics
- **Total Load Time**: < 2 seconds ⬜ PASS / ⬜ FAIL
- **API Response**: < 1 second ⬜ PASS / ⬜ FAIL

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.5: Inbox Page Load Time

#### Test Steps
- [ ] Navigate to `/inbox`
- [ ] Hard refresh: `Ctrl+Shift+R`
- [ ] **Wait for conversations list to load**

#### Measurements
- [ ] **Total Load Time**: _______ seconds
- [ ] **API response time** (`/api/inbox`): _______ ms

#### Target Metrics
- **Total Load Time**: < 2 seconds ⬜ PASS / ⬜ FAIL

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.6: Identify Slow API Calls

#### Analysis Steps
- [ ] Review Network tab for all pages tested above
- [ ] Sort by "Time" column (slowest first)
- [ ] Identify API calls taking > 1 second

#### List Slow API Calls

| Endpoint | Average Time | Page | Notes |
|----------|--------------|------|-------|
| | | | |
| | | | |
| | | | |

#### Recommendations
- [ ] Add caching: ⬜ Needed / ⬜ Not needed
- [ ] Optimize database queries: ⬜ Needed / ⬜ Not needed
- [ ] Reduce payload size: ⬜ Needed / ⬜ Not needed
- [ ] Implement pagination: ⬜ Needed / ⬜ Not needed

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.1.7: Test with Network Throttling

#### Test Steps
- [ ] Open DevTools → Network tab
- [ ] Set throttling to "Fast 3G"
- [ ] Navigate to each major page:
  - [ ] Dashboard: _______ seconds
  - [ ] Leads: _______ seconds
  - [ ] Lead Detail: _______ seconds
  - [ ] Renewals: _______ seconds
  - [ ] Inbox: _______ seconds

#### Target Metrics (Fast 3G)
- **All pages**: < 5 seconds ⬜ PASS / ⬜ FAIL

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

## 📋 TEST SCRIPT 7.2: Bundle Size Check

### Prerequisites
- Terminal open in project directory
- Node.js installed

---

### 7.2.1: Build for Production

#### Test Steps
- [ ] Run build command:
  ```powershell
  npm run build
  ```
- [ ] **Expected**: Build completes without errors
- [ ] **Expected**: Shows bundle size information
- [ ] **Actual**: _______________

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.2.2: Analyze Bundle Sizes

#### Check Build Output
Look for output like:
```
Route (app)                              Size     First Load JS
┌ ○ /                                    5.2 kB        85.3 kB
├ ○ /leads                              12.1 kB        92.2 kB
├ ○ /renewals                            8.4 kB        88.5 kB
└ ○ /inbox                               9.8 kB        89.9 kB

+ First Load JS shared by all           80.1 kB
```

#### Record Bundle Sizes
- [ ] **Shared JS (First Load)**: _______ kB
- [ ] **Dashboard page**: _______ kB (route + shared)
- [ ] **Leads page**: _______ kB
- [ ] **Renewals page**: _______ kB
- [ ] **Inbox page**: _______ kB
- [ ] **Largest bundle**: _______ (page: _______)

#### Target Metrics
- **First Load JS**: < 200 KB ⬜ PASS / ⬜ FAIL
- **Individual route**: < 100 KB ⬜ PASS / ⬜ FAIL
- **Total initial JS**: < 500 KB ⬜ PASS / ⬜ FAIL

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.2.3: Identify Large Dependencies

#### Check for Large Libraries
- [ ] Use bundle analyzer (if available):
  ```powershell
  npm install -D @next/bundle-analyzer
  ```
- [ ] Or check `node_modules` sizes manually
- [ ] Identify unexpectedly large dependencies

#### Common Large Dependencies to Check
- [ ] `recharts` - Used for charts
- [ ] `date-fns` - Date utilities
- [ ] `lucide-react` - Icons
- [ ] `@radix-ui/*` - UI components

**List Large Dependencies:**
1. Package: _______, Size: _______ KB
2. Package: _______, Size: _______ KB
3. Package: _______, Size: _______ KB

**Result**: ⬜ PASS / ⬜ FAIL  
**Notes**: _______________________________

---

### 7.2.4: Check Code Splitting

#### Verify Routes are Code Split
- [ ] Check build output shows separate bundles for each route
- [ ] **Expected**: Each route has its own bundle
- [ ] **Expected**: Shared code in separate chunk
- [ ] **Actual**: _______________

**Check for:**
- [ ] Dynamic imports used where appropriate
- [ ] Heavy components lazy loaded
- [ ] Routes split correctly

**Result**: ⬜ PASS / ⬜ FAIL  
**Issues Found**: _______________________________

---

### 7.2.5: Optimize If Needed

#### Recommendations Based on Results

**If bundles are too large:**
- [ ] Remove unused dependencies
- [ ] Use dynamic imports for heavy components
- [ ] Tree-shake unused code
- [ ] Split vendor chunks

**If load times are slow:**
- [ ] Add caching headers to API responses
- [ ] Implement pagination for large lists
- [ ] Reduce initial data load
- [ ] Add loading skeletons (already implemented)

**Actions Taken:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Result**: ⬜ OPTIMIZED / ⬜ NO OPTIMIZATION NEEDED

---

## 📊 PHASE 7 TEST SUMMARY

### Performance Metrics

| Page | Load Time (s) | Target | Status |
|------|---------------|--------|--------|
| Dashboard | _______ | < 2s | ⬜ PASS / ⬜ FAIL |
| Leads | _______ | < 2s | ⬜ PASS / ⬜ FAIL |
| Lead Detail | _______ | < 2s | ⬜ PASS / ⬜ FAIL |
| Renewals | _______ | < 2s | ⬜ PASS / ⬜ FAIL |
| Inbox | _______ | < 2s | ⬜ PASS / ⬜ FAIL |

### Bundle Sizes

| Metric | Size | Target | Status |
|--------|------|--------|--------|
| First Load JS | _______ KB | < 200 KB | ⬜ PASS / ⬜ FAIL |
| Largest Route | _______ KB | < 100 KB | ⬜ PASS / ⬜ FAIL |
| Total Initial JS | _______ KB | < 500 KB | ⬜ PASS / ⬜ FAIL |

### Slow API Calls (> 1s)

| Endpoint | Time | Page | Status |
|----------|------|------|--------|
| | | | |
| | | | |

### Overall Performance Rating
- **Excellent** (< 1s average): ⬜
- **Good** (1-2s average): ⬜
- **Fair** (2-3s average): ⬜
- **Poor** (> 3s average): ⬜

### Optimization Recommendations
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

### Next Steps
- [ ] Implement optimizations if needed
- [ ] Retest after optimizations
- [ ] Proceed to Phase 8

---

**Tested By**: _______________  
**Date**: _______________  
**Time**: _______________

---

## 🔧 Performance Optimization Commands

### Analyze Bundle (if @next/bundle-analyzer installed)
```powershell
ANALYZE=true npm run build
# Opens bundle analyzer in browser
```

### Check for Unused Dependencies
```powershell
npx depcheck
```

### Check Dependency Sizes
```powershell
npx bundlephobia <package-name>
```

### Test Production Build Locally
```powershell
npm run build
npm run start
# Test at http://localhost:3000
```

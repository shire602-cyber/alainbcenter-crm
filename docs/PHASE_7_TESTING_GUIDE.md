# PHASE 7: PERFORMANCE TESTING GUIDE

**Objective**: Measure and verify application performance across pages and API endpoints.

---

## 🚀 QUICK START

### 1. Prerequisites
- ✅ Dev server running on `http://localhost:3000`
- ✅ Browser DevTools installed
- ✅ Logged in as admin user

### 2. Testing Tools Needed
- Browser DevTools (F12)
- Network tab
- Performance tab (optional, for detailed metrics)

---

## 📋 TESTING PROCEDURE

### Test 1: Dashboard Performance

1. **Navigate to Dashboard**
   - URL: `http://localhost:3000/`
   - Ensure you're logged in

2. **Open DevTools** (F12)
   - Go to **Network** tab
   - Enable **"Disable cache"** checkbox
   - Clear network log (trash icon)

3. **Hard Refresh**
   - Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
   - Wait for page to fully load

4. **Record Metrics**
   - **Total Load Time**: Look at the bottom of Network tab ("Finish" time)
   - **First Contentful Paint**: Hover over first request, or use Performance tab
   - **API Calls**: Count requests to `/api/*` endpoints
   - **Slowest API**: Sort by "Time" column, identify slowest

5. **Record in**: `docs/TEST_RESULTS_PHASE_7.md`

---

### Test 2: Leads List Performance

1. **Navigate to Leads**
   - URL: `http://localhost:3000/leads`

2. **Repeat Steps 2-4** from Test 1

3. **Focus on**:
   - `/api/leads` response time
   - Number of leads loaded (pagination working?)
   - Total page load time

---

### Test 3: Lead Detail Page Performance

1. **Navigate to a Lead**
   - URL: `http://localhost:3000/leads/1` (or any valid lead ID)

2. **Repeat Steps 2-4** from Test 1

3. **Focus on**:
   - `/api/leads/[id]` response time
   - Multiple API calls (messages, documents, tasks, etc.)
   - Whether calls are parallel or sequential

---

### Test 4: Renewals Page Performance

1. **Navigate to Renewals**
   - URL: `http://localhost:3000/renewals`

2. **Repeat Steps 2-4** from Test 1

3. **Focus on**:
   - `/api/renewals` response time
   - Complex data aggregation (KPIs, expiry items)

---

### Test 5: Inbox Page Performance

1. **Navigate to Inbox**
   - URL: `http://localhost:3000/inbox`

2. **Repeat Steps 2-4** from Test 1

3. **Focus on**:
   - Conversations list API response time
   - Message loading performance

---

## 🔧 API PERFORMANCE TESTING

### Using the PowerShell Script

Run the provided script to test API endpoints:

```powershell
.\scripts\test-api-performance.ps1
```

**Note**: This script tests endpoints without authentication. For authenticated endpoints, you'll need to:
1. Login first and capture the session cookie
2. Add the cookie to the script's requests
3. Or test manually via browser DevTools Network tab

---

## 📊 PERFORMANCE TARGETS

### Page Load Times
- **Dashboard**: < 2 seconds
- **Leads List**: < 2 seconds
- **Lead Detail**: < 2 seconds (initial), < 3 seconds (all sections)
- **Renewals**: < 2 seconds
- **Inbox**: < 2 seconds

### API Response Times
- **List endpoints** (`/api/leads`, `/api/renewals`): < 500ms
- **Detail endpoints** (`/api/leads/[id]`): < 500ms
- **Complex operations** (renewal engine): < 2000ms

### Bundle Sizes
- **First Load JS**: < 244 KB
- **Largest Chunk**: < 200 KB

---

## 🐛 COMMON PERFORMANCE ISSUES TO WATCH FOR

### 1. Slow API Endpoints
- **Symptom**: API calls taking > 500ms
- **Possible Causes**: 
  - Complex database queries
  - Missing indexes
  - N+1 query problems
  - Large data sets without pagination

### 2. Large Bundle Sizes
- **Symptom**: First Load JS > 244 KB
- **Possible Causes**:
  - Unused dependencies
  - Missing code splitting
  - Large libraries included in main bundle

### 3. Sequential API Calls
- **Symptom**: Multiple API calls loading one after another
- **Possible Causes**:
  - Dependent data loading (API 2 needs data from API 1)
  - Not using parallel requests

### 4. Slow First Contentful Paint
- **Symptom**: FCP > 1 second
- **Possible Causes**:
  - Large initial HTML
  - Blocking JavaScript
  - Slow server-side rendering

---

## 📝 RECORDING RESULTS

Record all results in: `docs/TEST_RESULTS_PHASE_7.md`

For each test, record:
- ✅ Actual metrics (times, sizes, counts)
- ✅ Pass/Fail status against targets
- ✅ Issues found
- ✅ Screenshots (optional but helpful)

---

## ✅ COMPLETION CHECKLIST

- [ ] Dashboard load time tested
- [ ] Leads list load time tested
- [ ] Lead detail page load time tested
- [ ] Renewals page load time tested
- [ ] Inbox page load time tested
- [ ] API response times tested
- [ ] Bundle sizes checked (if build successful)
- [ ] Results documented in TEST_RESULTS_PHASE_7.md
- [ ] Performance issues identified and logged

---

**Guide Created**: 2025-01-15  
**Status**: Ready for execution after server restart


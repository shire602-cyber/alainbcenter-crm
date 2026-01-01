# Leads Route Hook Audit - React #310 Fix

## Issue: React #310 Hook Order Mismatch

### Root Causes Found

#### 1. ConversationWorkspace.tsx (FIXED)
**File**: `src/components/leads/ConversationWorkspace.tsx`
**Line**: 655 (before fix)

**Problem**: `useState` hook declared AFTER conditional return:
```typescript
// Line 628-652: Conditional return
if (loading) {
  return <Skeleton />
}

// Line 655: Hook AFTER return - VIOLATION!
const [leadData, setLeadData] = useState<...>(lead)
```

**Fix**: Moved `leadData` useState and useEffect BEFORE conditional return.

#### 2. NextBestActionPanel.tsx - PlaybooksSection (FIXED)
**File**: `src/components/leads/NextBestActionPanel.tsx`
**Line**: 474 (before fix)

**Problem**: Component returns `null` after hooks when `playbooks.length === 0`:
```typescript
// Lines 413-419: Hooks called
const [playbooks, setPlaybooks] = useState([])
const [loading, setLoading] = useState(false)
useEffect(() => { ... }, [lead])

// Line 474: Return null after hooks - VIOLATION!
if (playbooks.length === 0) return null
```

**Impact**: When `playbooks` changes from empty to non-empty, component tree changes, causing hook order mismatch.

**Fix**: Return empty fragment `<></>` instead of `null` to maintain consistent component tree.

### Verification

All hooks in affected components are now called unconditionally before any returns:
- ✅ ConversationWorkspace: All hooks before conditional return
- ✅ PlaybooksSection: Returns fragment instead of null
- ✅ QuoteCadence: Hooks before conditional returns
- ✅ NextBestActionPanel: Hooks before conditional returns

### Files Changed
1. `src/components/leads/ConversationWorkspace.tsx` - Fixed hook order
2. `src/components/leads/NextBestActionPanel.tsx` - Fixed null return
3. `src/app/leads/[id]/page.tsx` - Handle both API response formats
4. `scripts/verify_prod_leads.ts` - Enhanced stack trace capture

### Next Steps
After deployment, verify with:
```bash
E2E_BASE_URL="https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app" \
E2E_EMAIL="admin@alainbcenter.com" \
E2E_PASSWORD="your-password" \
npx tsx scripts/verify_prod_leads.ts
```

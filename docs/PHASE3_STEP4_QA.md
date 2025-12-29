# Phase 3 Step 4: Personal Command Center — QA Checklist

## Manual QA Checklist

### ✅ Focus Hero
- [ ] Focus hero shows ONLY ONE item (or "All caught up ✅")
- [ ] Hero card has premium layout: left (title+preview+meta), right (ONE CTA button)
- [ ] Channel icon displays correctly
- [ ] SLA dot appears as tiny red dot (not red background) if SLA breached
- [ ] "Why now" line is present and makes sense
- [ ] Card is pressable with hover lift + active press scale
- [ ] CTA button navigates correctly

### ✅ Up Next
- [ ] Up Next shows max 3 items
- [ ] Up Next excludes focus item (no duplicates)
- [ ] Each row is pressable
- [ ] Secondary actions only on hover (desktop)
- [ ] No competing primary CTAs
- [ ] Clicking row navigates to correct lead

### ✅ Signals Panel
- [ ] Signals show max 5 each (Renewals, Waiting, Alerts)
- [ ] Cards look pressable with hover lift
- [ ] Empty states show "All clear ✅"
- [ ] Badges show correct severity (no red backgrounds)

### ✅ Momentum Strip
- [ ] Momentum pills are clickable
- [ ] Pills route correctly:
  - Replies → `/inbox`
  - Quotes → `/leads?filter=quotes`
  - Renewals → `/leads?filter=renewals`
  - Revenue → `/leads?filter=qualified`
- [ ] Empty state shows "Getting started…"
- [ ] Hover lift + active press state work

### ✅ Completed Today Card
- [ ] Shows 2-3 metrics with subtle celebration copy
- [ ] No confetti or aggressive animations
- [ ] Empty state is positive ("Your completed work will appear here")

### ✅ Performance & UX
- [ ] Dashboard loads with skeleton instantly (within 50-100ms)
- [ ] No layout shift
- [ ] No red backgrounds anywhere (red only as tiny dot/label)
- [ ] Mobile layout stacked; no horizontal scroll
- [ ] All cards have hover lift + active press scale
- [ ] Transitions are smooth (150-220ms)
- [ ] No looping animations

### ✅ Data & Sync
- [ ] Single endpoint `/api/dashboard/command-center` returns all data
- [ ] Smart polling works (60s interval, pauses when tab hidden)
- [ ] Manual refresh button works
- [ ] Focus Now updates when item is completed
- [ ] No duplicate items between Focus Now and Up Next

### ✅ Build & Type Safety
- [ ] `npm run build` passes
- [ ] No TypeScript errors
- [ ] No console errors in browser

## Test Scenarios

### Scenario 1: Empty Dashboard
1. Open dashboard with no active leads/tasks
2. **Expected:** Focus hero shows "All caught up ✅"
3. **Expected:** Up Next is hidden or empty
4. **Expected:** Signals show "All clear ✅" for each section
5. **Expected:** Momentum shows "Getting started…"

### Scenario 2: One Focus Item
1. Create a lead with unread message
2. Open dashboard
3. **Expected:** Focus hero shows ONE item with "Reply to [Name]"
4. **Expected:** Up Next shows max 3 other items (not the focus item)
5. **Expected:** Clicking CTA opens lead page

### Scenario 3: Multiple Priorities
1. Create multiple leads with different priorities:
   - Unread message (highest)
   - Overdue task
   - Quote due
   - Renewal in 7 days
2. Open dashboard
3. **Expected:** Focus Now = unread message (highest priority)
4. **Expected:** Up Next = next 3 items (task, quote, renewal)
5. **Expected:** No duplicates

### Scenario 4: Mobile Layout
1. Open dashboard on mobile (< 1024px)
2. **Expected:** All sections stack vertically
3. **Expected:** No horizontal scroll
4. **Expected:** Cards are still pressable
5. **Expected:** Tap targets are >= 44px

### Scenario 5: Polling & Refresh
1. Open dashboard
2. Switch to another tab (hide)
3. **Expected:** Polling pauses
4. Switch back (show)
5. **Expected:** Polling resumes, data refreshes
6. Click manual refresh button
7. **Expected:** Data refreshes immediately

## Regression Checks

- [ ] No changes to AI/orchestrator logic
- [ ] No changes to lead auto-fill behavior
- [ ] No changes to conversation threading
- [ ] No changes to Prisma schema
- [ ] Existing dashboard features still work


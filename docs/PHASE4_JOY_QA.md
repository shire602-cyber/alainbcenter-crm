# Phase 4: User Joy Metrics — QA Checklist

## Manual QA Checklist

### ✅ Joy Metrics Computation
- [ ] Time-to-first-reply (TTFR) median computed correctly for today
- [ ] Tasks completed today counted correctly
- [ ] Leads advanced today counted correctly (stage changes or task completions)
- [ ] Conversations saved from SLA breach counted correctly
- [ ] Revenue actions (quotes + renewals) counted correctly
- [ ] Streak computed correctly (days active, today done)

### ✅ API Endpoint
- [ ] `/api/dashboard/joy` returns all metrics
- [ ] Endpoint handles errors gracefully (returns zeros/null)
- [ ] Response time is acceptable (< 500ms)

### ✅ Joy Strip UI
- [ ] JoyStrip component renders correctly
- [ ] Shows 3–5 metric pills (calm, premium design)
- [ ] Encouragement text is deterministic and positive
- [ ] Never guilts the user (always positive framing)
- [ ] Empty state shows "Ready to make an impact today"
- [ ] Skeleton loader shows within 50–100ms

### ✅ Friction Alerts (Quiet)
- [ ] Friction section only appears when needed
- [ ] High TTFR alert shows when median > 2 hours
- [ ] Overdue tasks count shows correctly
- [ ] Waiting long count shows correctly (> 7 days)
- [ ] No red blocks (subtle gray with small label)
- [ ] Friction alerts are subtle, not alarming

### ✅ Integration
- [ ] JoyStrip integrated into dashboard (under MomentumStrip)
- [ ] Smart polling works (60s interval, pauses when hidden)
- [ ] No layout shift when metrics load
- [ ] Mobile layout works (wraps nicely)

### ✅ Performance
- [ ] Metrics computation is efficient (no heavy joins)
- [ ] No N+1 queries
- [ ] Response time acceptable
- [ ] No memory leaks

### ✅ Build & Type Safety
- [ ] `npm run build` passes
- [ ] No TypeScript errors
- [ ] No console errors in browser
- [ ] No schema changes (verified)

## Test Scenarios

### Scenario 1: Empty Day (No Activity)
1. Open dashboard with no activity today
2. **Expected:** JoyStrip shows "Ready to make an impact today"
3. **Expected:** No metric pills (or all zeros)
4. **Expected:** No friction alerts (or all zeros)
5. **Expected:** Positive, encouraging tone

### Scenario 2: Active Day
1. Complete 3 tasks, send 2 replies, advance 1 lead
2. Open dashboard
3. **Expected:** JoyStrip shows:
   - TTFR median (if replies sent)
   - 3 tasks done
   - 1 lead advanced
   - Encouragement text based on activity
4. **Expected:** Friction alerts only if applicable

### Scenario 3: High Friction
1. Create scenario with:
   - High TTFR (> 2 hours)
   - 5 overdue tasks
   - 3 leads waiting > 7 days
2. Open dashboard
3. **Expected:** Friction section appears
4. **Expected:** Shows all three friction indicators
5. **Expected:** Subtle gray styling (not red/alarming)

### Scenario 4: Streak
1. Complete tasks for 5 consecutive days
2. Open dashboard on day 6
3. **Expected:** Streak shows "5 day streak"
4. **Expected:** Encouragement text mentions streak if >= 7 days

### Scenario 5: Saved from SLA
1. Create conversation with SLA risk (needsReplySince set)
2. Send reply today before 24h breach
3. Open dashboard
4. **Expected:** "Saved from SLA" metric shows count
5. **Expected:** Encouragement text mentions "Saved from SLA breach"

## Regression Checks

- [ ] No changes to AI/orchestrator logic
- [ ] No changes to lead auto-fill behavior
- [ ] No changes to conversation threading
- [ ] No schema changes (no new tables/columns)
- [ ] Existing features still work
- [ ] No external analytics SDK added

## Screenshots Checklist

When testing, capture screenshots of:
1. **Empty state:** JoyStrip with no activity
2. **Active state:** JoyStrip with metrics showing
3. **Friction alerts:** Friction section when applicable
4. **Streak display:** Streak pill when active
5. **Mobile layout:** JoyStrip on mobile device

## Performance Benchmarks

- [ ] API response time: < 500ms
- [ ] UI render time: < 100ms
- [ ] No layout shift on load
- [ ] Polling interval: 60s (not too frequent)



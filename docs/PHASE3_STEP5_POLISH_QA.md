# Phase 3 Step 5: Premium Visual Polish + Micro-Interactions — QA Checklist

## Manual QA Checklist

### ✅ Typography Hierarchy
- [ ] Typography feels premium: consistent type scale (title, h1, h2, body, meta)
- [ ] Line heights are comfortable (not cramped)
- [ ] Letter spacing is consistent
- [ ] Font weights are appropriate (not too bold, not too light)

### ✅ Dashboard Polish
- [ ] FocusHeroCard: true hero layout with context strip
- [ ] FocusHeroCard: preview shows quote icon and clamps to 2 lines
- [ ] FocusHeroCard: skeleton matches final layout (no jumping)
- [ ] UpNextList: modern inbox items with channel icon in soft circle
- [ ] UpNextList: hover reveals micro-actions (Open, Snooze) — desktop only
- [ ] UpNextList: no competing primary CTAs
- [ ] SignalsPanel: control tower feeling with count badges
- [ ] SignalsPanel: animated pulse on state change (not looping)
- [ ] SignalsPanel: empty states show "All clear ✅"
- [ ] MomentumStrip: metric pills feel clickable and crisp
- [ ] MomentumStrip: hover lift + active press scale work
- [ ] CompletedTodayCard: shows best metric first
- [ ] CompletedTodayCard: subtle gradient background (not loud)

### ✅ Lead Page Polish
- [ ] Layout density: increased breathing room, consistent spacing rhythm
- [ ] LeadDNA: section headings ("Identity", "Qualification", "Expiry", "Sponsor", "Documents")
- [ ] LeadDNA: qualification progress looks like premium checklist
  - [ ] Shows 0/5 pill + progress bar
  - [ ] Each item has status: empty / captured (check icon)
  - [ ] Visual distinction between completed and incomplete
- [ ] LeadDNA: expiry timeline is readable and sorted
- [ ] LeadDNA: expiry badges show as pills (TODAY / 7d / 30d)
- [ ] ConversationWorkspace: message bubble typography improved
- [ ] ConversationWorkspace: clearer sender separation
- [ ] ConversationWorkspace: date separators styled as subtle pills
- [ ] ConversationWorkspace: scroll-to-bottom button appears when scrolled up
- [ ] ConversationWorkspace: scroll-to-bottom button only appears when not at bottom
- [ ] ConversationWorkspace: scroll-to-bottom button is pressable with micro-interaction
- [ ] NextBestActionPanel: recommended action card feels like premium CTA
- [ ] NextBestActionPanel: tasks list collapsed animates smoothly

### ✅ Micro-Interactions (Strict)
- [ ] Hover lift: translateY(-1px) + shadow increase on cards
- [ ] Press: scale(0.99–0.98) on buttons and pressable cards
- [ ] Fade/slide in on state change (150–220ms)
- [ ] Toast on important actions
- [ ] NO looping animations
- [ ] NO excessive motion
- [ ] NO flashing / noisy transitions

### ✅ Performance & UX
- [ ] Skeleton shows within 50–100ms (not blank space)
- [ ] No layout shift on load
- [ ] All cards have hover lift + active press scale
- [ ] Transitions are smooth (150–220ms)
- [ ] No red backgrounds anywhere (red only as tiny dot/label)
- [ ] Mobile layout stacked; no horizontal scroll

### ✅ Design Tokens
- [ ] Type scale: `.text-title`, `.text-h1`, `.text-h2`, `.text-body`, `.text-meta` work correctly
- [ ] Surface tokens: `.bg-app`, `.bg-card`, `.bg-card-muted` work
- [ ] Border tokens: `.border-subtle`, `.divider-soft` work
- [ ] Shadow tokens: `.shadow-soft`, `.shadow-premium`, `.shadow-premium-lg` work
- [ ] Radius tokens: `.radius-xl`, `.radius-2xl` work
- [ ] Interaction tokens: `.card-pressable`, `.btn-pressable`, `.focus-ring` work
- [ ] Skeleton shimmer: `.skeleton-shimmer` is subtle (no harsh gradients)
- [ ] Spacing helpers: `.stack-4`, `.stack-6`, `.stack-8` work
- [ ] Inset helpers: `.inset-card`, `.inset-hero` work

### ✅ Build & Type Safety
- [ ] `npm run build` passes
- [ ] No TypeScript errors
- [ ] No console errors in browser

## Test Scenarios

### Scenario 1: Dashboard Load
1. Open dashboard
2. **Expected:** Skeleton shows within 50–100ms
3. **Expected:** No layout shift when data loads
4. **Expected:** FocusHeroCard shows hero layout with context strip
5. **Expected:** UpNextList shows modern inbox items

### Scenario 2: Dashboard Interactions
1. Hover over FocusHeroCard
2. **Expected:** Card lifts slightly (translateY -1px) + shadow increases
3. **Expected:** CTA button has hover lift
4. Click CTA
5. **Expected:** Button scales down on press (scale 0.98)
6. Hover over UpNextList row
7. **Expected:** Micro-actions appear (desktop only)
8. **Expected:** Row lifts slightly

### Scenario 3: Signals Panel State Change
1. Open dashboard with signals
2. Complete a task that removes a signal
3. **Expected:** Signal module shows animated pulse (ring) on state change
4. **Expected:** Pulse stops after 600ms (not looping)

### Scenario 4: Lead Page Layout
1. Open lead detail page
2. **Expected:** LeadDNA has section headings ("Identity", "Qualification", etc.)
3. **Expected:** Qualification progress shows 0/5 pill + progress bar
4. **Expected:** Each qualification item has check icon if completed
5. **Expected:** Expiry timeline shows badges as pills (TODAY / 7d / 30d)

### Scenario 5: Conversation Scroll Button
1. Open lead with many messages
2. Scroll up (not at bottom)
3. **Expected:** Scroll-to-bottom button appears (floating, bottom-right)
4. **Expected:** Button is pressable with hover lift
5. Click button
6. **Expected:** Smoothly scrolls to bottom
7. **Expected:** Button disappears when at bottom

### Scenario 6: Mobile Layout
1. Open dashboard on mobile (< 1024px)
2. **Expected:** All sections stack vertically
3. **Expected:** No horizontal scroll
4. **Expected:** Cards are still pressable
5. **Expected:** Tap targets are >= 44px

## Regression Checks

- [ ] No changes to AI/orchestrator logic
- [ ] No changes to lead auto-fill behavior
- [ ] No changes to conversation threading
- [ ] No changes to Prisma schema
- [ ] Existing features still work


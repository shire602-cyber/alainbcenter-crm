# Phase 5F: Kanban View - QA Checklist

## Test Cases

### TC-K1: View Toggle Works
- [ ] Click "List" button - verify leads display in list format
- [ ] Click "Grid" button - verify leads display in grid format
- [ ] Click "Kanban" button - verify leads display in Kanban board
- [ ] Verify active view button is highlighted
- [ ] Verify view preference persists after page refresh (localStorage)

### TC-K2: Kanban Drag and Drop
- [ ] Drag a lead card from one column to another
- [ ] Verify card moves to new column immediately (optimistic update)
- [ ] Verify API call is made to update stage
- [ ] Verify stage update succeeds
- [ ] Verify card stays in new column after update
- [ ] Drag same card back - verify it moves back

### TC-K3: Mobile Drag and Drop
- [ ] On mobile device, long-press a card (200ms)
- [ ] Verify drag starts after long-press
- [ ] Drag card to different column
- [ ] Verify drop works correctly
- [ ] Verify no accidental scrolling during drag

### TC-K4: Filters Apply to Kanban
- [ ] Set search query - verify only matching leads shown in Kanban
- [ ] Set pipeline stage filter - verify Kanban respects filter
- [ ] Set source filter - verify Kanban respects filter
- [ ] Set AI score filter - verify Kanban respects filter
- [ ] Clear all filters - verify all leads shown

### TC-K5: Kanban Columns
- [ ] Verify all pipeline stages shown as columns
- [ ] Verify column headers show correct stage labels
- [ ] Verify column headers show lead counts
- [ ] Verify empty columns show "No leads" message
- [ ] Verify columns are scrollable horizontally on mobile

### TC-K6: Kanban Cards
- [ ] Verify each card shows:
  - [ ] Lead name and phone
  - [ ] Service label (if available)
  - [ ] AI score badge (if available)
  - [ ] Warning badges (expiry, follow-up due)
  - [ ] Last activity time
  - [ ] Assigned user (if available)
- [ ] Click card - verify navigates to lead detail page
- [ ] Verify card hover effects work

### TC-K7: Performance
- [ ] Load page with 100+ leads - verify no lag
- [ ] Switch between views - verify smooth transition
- [ ] Drag card - verify no lag during drag
- [ ] Verify no horizontal scroll on desktop
- [ ] Verify horizontal scroll works on mobile

### TC-K8: Error Handling
- [ ] Simulate API failure during drag - verify error toast shown
- [ ] Verify card reverts to original column on error
- [ ] Verify leads reload after error
- [ ] Verify no duplicate cards after error

### TC-K9: Edge Cases
- [ ] Drag card to same column - verify no API call
- [ ] Drag card while another drag is in progress - verify only one update
- [ ] Switch view while drag is in progress - verify graceful handling
- [ ] Refresh page during drag - verify no errors

## Expected Behavior

- **View Toggle**: Three buttons (List, Grid, Kanban) in header
- **Persistence**: View choice saved in localStorage (key: `leadsViewMode`)
- **Drag and Drop**: Desktop uses pointer drag, mobile uses long-press (200ms)
- **Optimistic Updates**: Cards move immediately, API call happens in background
- **Error Recovery**: On API failure, card reverts and error toast shown
- **Filters**: All existing filters work with Kanban view
- **Performance**: Smooth scrolling, no lag with 200+ leads

## Manual Test Steps

1. **Test View Toggle**:
   - Navigate to `/leads`
   - Click each view button (List, Grid, Kanban)
   - Refresh page - verify last selected view is active

2. **Test Drag and Drop**:
   - Switch to Kanban view
   - Drag a lead from "New" to "Contacted"
   - Verify card moves immediately
   - Check network tab - verify PATCH request to `/api/leads/[id]`
   - Refresh page - verify lead is in "Contacted" column

3. **Test Filters**:
   - Set search query "test"
   - Switch to Kanban - verify only matching leads shown
   - Clear search - verify all leads shown

4. **Test Mobile**:
   - Open on mobile device
   - Long-press a card (hold for 200ms)
   - Drag to different column
   - Verify drop works

5. **Test Error Handling**:
   - Open browser DevTools → Network tab
   - Set network to "Offline"
   - Try to drag a card
   - Verify error toast appears
   - Verify card reverts to original position

## Notes

- Kanban view respects all existing filters
- View preference persists across sessions
- Drag and drop works on both desktop and mobile
- No horizontal scroll on desktop (columns fit viewport)
- Horizontal scroll enabled on mobile for better UX


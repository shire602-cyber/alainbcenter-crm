# Phase 5: Lead Page Powerhouse - QA Checklist

## A) Messages: Inbound + Outbound ✅

### Test Cases
- [ ] **TC-A1**: Open lead page, verify BOTH inbound and outbound messages are visible
- [ ] **TC-A2**: Verify messages are in chronological order (oldest first)
- [ ] **TC-A3**: Verify message direction is correct (INBOUND left, OUTBOUND right)
- [ ] **TC-A4**: Verify message grouping works (consecutive messages from same sender share avatar)
- [ ] **TC-A5**: Verify date separators appear correctly (Today, Yesterday, date)

### Expected Behavior
- All messages (inbound and outbound) should be visible
- Messages should be ordered chronologically
- WhatsApp-like layout: inbound left, outbound right
- Grouping should work correctly

## B) Media Support ✅

### Test Cases
- [ ] **TC-B1**: Send/receive image message - verify image preview appears
- [ ] **TC-B2**: Click image - verify lightbox opens
- [ ] **TC-B3**: Send/receive PDF document - verify file chip with download button appears
- [ ] **TC-B4**: Click document - verify file downloads
- [ ] **TC-B5**: Send/receive audio message - verify audio player appears
- [ ] **TC-B6**: Play audio - verify playback works
- [ ] **TC-B7**: Verify audio duration is displayed (if available)
- [ ] **TC-B8**: Send/receive video - verify video player appears

### Expected Behavior
- Images: Inline preview, click opens lightbox
- Documents: File chip with icon + filename + download button
- Audio: HTML5 audio player with duration
- Video: HTML5 video player with duration

## C) Media Filter Toggle ✅

### Test Cases
- [ ] **TC-C1**: Click "All" filter - verify all messages shown
- [ ] **TC-C2**: Click "Media" filter - verify only images/videos shown
- [ ] **TC-C3**: Click "Docs" filter - verify only documents shown
- [ ] **TC-C4**: Click "Audio" filter - verify only audio messages shown
- [ ] **TC-C5**: Verify filter state persists during session

### Expected Behavior
- Filter buttons should be visible above messages
- Filtering should work client-side (no API call)
- Empty state should show appropriate message when no matches

## D) File Upload ✅

### Test Cases
- [ ] **TC-D1**: Click upload button in composer
- [ ] **TC-D2**: Select image file - verify upload succeeds
- [ ] **TC-D3**: Select PDF file - verify upload succeeds
- [ ] **TC-D4**: Select audio file - verify upload succeeds
- [ ] **TC-D5**: Verify uploaded file appears in attachments list
- [ ] **TC-D6**: Verify file size validation (max 16MB)
- [ ] **TC-D7**: Verify file type validation (only allowed types)

### Expected Behavior
- Upload button should be visible in composer
- File picker should accept: pdf, png, jpg, docx, mp3, m4a, wav
- Uploaded files should appear in list/grid
- Clicking item should open preview or download

## E) Voice Note Recording ⏳

### Test Cases
- [ ] **TC-E1**: Click voice note button - verify recording starts
- [ ] **TC-E2**: Verify recording timer appears
- [ ] **TC-E3**: Stop recording - verify preview appears
- [ ] **TC-E4**: Send voice note - verify upload succeeds
- [ ] **TC-E5**: Verify voice note appears in conversation
- [ ] **TC-E6**: Verify audio player works for recorded voice note

### Expected Behavior
- Voice note button should be visible in composer
- Recording should use MediaRecorder API
- Preview should show before sending
- Sent voice note should appear as audio message

## F) Renewals Visibility ⏳

### Test Cases
- [ ] **TC-F1**: Lead with expiry items - verify "Renewal Actions" module appears
- [ ] **TC-F2**: Verify next expiry item is displayed
- [ ] **TC-F3**: Click "Create renewal reminder" - verify task created
- [ ] **TC-F4**: Verify task is due 30/14/7 days before expiry
- [ ] **TC-F5**: Click "Open in Renewals" - verify navigation works
- [ ] **TC-F6**: Lead with expiry within 90 days - verify renewal_reminder recommendation
- [ ] **TC-F7**: Lead with expiry within 30 days - verify escalation badge

### Expected Behavior
- Renewal Actions module should be visible on lead page
- Next expiry item should be prominently displayed
- Actions should be clickable and functional
- Next Best Action should recommend renewal_reminder when appropriate

## G) API Endpoints ✅

### Test Cases
- [ ] **TC-G1**: `GET /api/leads/[id]/messages` - verify returns both inbound and outbound
- [ ] **TC-G2**: `GET /api/leads/[id]/messages` - verify includes attachments array
- [ ] **TC-G3**: `POST /api/leads/[id]/attachments/upload` - verify upload succeeds
- [ ] **TC-G4**: `GET /api/leads/[id]/attachments` - verify returns all attachments
- [ ] **TC-G5**: Verify authentication required for all endpoints
- [ ] **TC-G6**: Verify file size validation (16MB max)
- [ ] **TC-G7**: Verify file type validation

### Expected Behavior
- All endpoints should require authentication
- Upload should validate file size and type
- Attachments should be linked to lead/conversation/message

## H) Edge Cases

### Test Cases
- [ ] **TC-H1**: Message with both text and media - verify both render
- [ ] **TC-H2**: Message with only media (no text) - verify only media renders
- [ ] **TC-H3**: Large image - verify doesn't break layout
- [ ] **TC-H4**: Multiple attachments in one message - verify all render
- [ ] **TC-H5**: Audio message without transcript - verify doesn't show "[audio]" as text
- [ ] **TC-H6**: Failed upload - verify error message appears
- [ ] **TC-H7**: Network error during upload - verify retry works

## I) Performance

### Test Cases
- [ ] **TC-I1**: Lead with 100+ messages - verify scrolling is smooth
- [ ] **TC-I2**: Multiple large images - verify lazy loading works
- [ ] **TC-I3**: Filter switching - verify no lag
- [ ] **TC-I4**: Upload large file - verify progress indicator

## Notes

- All features should work on desktop and mobile
- Dark mode should be supported
- Accessibility should be maintained
- No console errors should appear











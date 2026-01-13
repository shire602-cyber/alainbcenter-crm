# Instagram Integration Issues and Fixes

## Issues Reported

1. **No AI reply** - AI auto-replies not working for Instagram
2. **Can't send outbound messages manually** - Error: "Failed to send WhatsApp message" (trying to send via WhatsApp)
3. **No username** - Shows `@6221774837922501` instead of Instagram username
4. **No auto detect info** - Name, nationality, service, phone not extracted from messages

## Root Causes Identified

### 1. Hardcoded Error Message (FIXED ✅)
- **Location**: `src/app/api/inbox/conversations/[id]/messages/route.ts:587`
- **Issue**: Error message was hardcoded to "Failed to send WhatsApp message" even for Instagram
- **Fix**: Changed to use channel name dynamically: `Failed to send ${channelName} message`

### 2. Automation Worker Not Running
- **Issue**: Automation jobs are queued but not processed if worker isn't running
- **Check**: Go to `/admin/automation` and verify worker is started
- **Solution**: Worker needs to be manually started or auto-started via env var

### 3. Profile Fetch May Be Failing
- **Issue**: Instagram profile fetch might be failing silently
- **Check**: Look for logs like:
  - `❌ [INSTAGRAM-PROFILE] Failed to fetch Instagram user profile`
  - `⚠️ [INSTAGRAM-ROBUST] No Instagram profile available`
- **Solution**: Check Meta Graph API permissions and access token

### 4. Automation Jobs Not Processing
- **Issue**: Jobs are queued but automation worker might not be processing them
- **Check**: Query database:
  ```sql
  SELECT * FROM "AutomationJob" 
  WHERE type = 'inbound_message' 
  AND status = 'PENDING' 
  ORDER BY "createdAt" DESC 
  LIMIT 10;
  ```
- **Solution**: Ensure automation worker is running

## Fixes Applied

### ✅ Phase 1: Auto-Fill Data Extraction
- Added automation job queuing in `processInstagramMessageRobust`
- Added automation job queuing in `handleInboundMessageAutoMatch`
- **Status**: Code complete, needs worker running

### ✅ Phase 2: Instagram Username Display
- Improved inbox display logic
- Profile fetch and contact update logic in place
- **Status**: Code complete, needs profile fetch to succeed

### ✅ Phase 3: Auto-Reply System
- Fixed `executeSendAIReply` to use actual channel
- Channel-to-provider mapping works
- **Status**: Code complete, needs automation worker running

### ✅ Phase 4: Outbound Message Routing
- Fixed hardcoded error message
- Channel-to-provider mapping works
- **Status**: Code complete

## Testing Steps

### 1. Start Automation Worker
```bash
# Check if worker is running
curl http://localhost:3000/api/admin/automation/worker

# Start worker if not running
curl -X POST http://localhost:3000/api/admin/automation/worker/start
```

Or go to `/admin/automation` and click "Start Worker"

### 2. Check Profile Fetch
Send an Instagram DM and check terminal logs for:
- `✅ [INSTAGRAM-PROFILE] Fetched Instagram user profile`
- `✅ [INSTAGRAM-ROBUST] Contact fullName updated with profile name`

If you see errors, check:
- Meta Graph API access token
- Instagram permissions in Meta App settings
- Page access token validity

### 3. Check Automation Jobs
After sending an Instagram message, check:
```sql
SELECT id, type, status, "createdAt", data 
FROM "AutomationJob" 
WHERE type = 'inbound_message' 
ORDER BY "createdAt" DESC 
LIMIT 5;
```

Jobs should be:
- `status = 'PENDING'` initially
- `status = 'COMPLETED'` after processing
- `status = 'FAILED'` if there's an error

### 4. Test Manual Outbound
1. Go to `/inbox`
2. Select Instagram conversation
3. Send a message
4. Should NOT see "Failed to send WhatsApp message" error
5. Should see success message

### 5. Test AI Auto-Reply
1. Send Instagram DM with a question
2. Check terminal logs for:
   - `✅ Queued automation job (type: inbound_message)`
   - `[ORCHESTRATOR] Channel mapping: { mappedProvider: 'instagram' }`
   - `📤 [OUTBOUND-IDEMPOTENCY] Sending Instagram message`
3. AI reply should appear in Instagram DM

## Debugging Commands

### Check Automation Worker Status
```sql
SELECT * FROM "SystemSetting" WHERE key = 'automation_worker_running';
```

### Check Recent Automation Jobs
```sql
SELECT 
  id, 
  type, 
  status, 
  "createdAt", 
  "updatedAt",
  data
FROM "AutomationJob" 
WHERE type = 'inbound_message' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### Check Instagram Messages
```sql
SELECT 
  id, 
  channel, 
  direction, 
  body, 
  status, 
  "providerMessageId",
  "createdAt"
FROM "Message" 
WHERE channel = 'instagram' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

### Check Contact Updates
```sql
SELECT 
  id, 
  phone, 
  "fullName", 
  "phoneNormalized",
  "updatedAt"
FROM "Contact" 
WHERE phone LIKE 'ig:%' 
ORDER BY "updatedAt" DESC 
LIMIT 10;
```

## Next Steps

1. **Deploy fixes** - Push to production
2. **Start automation worker** - Ensure it's running
3. **Test profile fetch** - Verify Instagram profile API is working
4. **Monitor logs** - Check for any errors
5. **Test end-to-end** - Send Instagram DM and verify:
   - Username displays correctly
   - Data is auto-extracted
   - AI reply is sent
   - Manual outbound works

## Known Issues

1. **Duplicate Message Error**: The idempotency check is working (preventing duplicate sends), but the error message was misleading. This is now fixed.

2. **Worker Auto-Start**: The automation worker may need to be manually started. Consider setting `AUTOPILOT_WORKER_AUTO_START=true` in production.

3. **Profile Fetch Permissions**: Ensure Meta Graph API has `instagram_basic` and `instagram_manage_messages` permissions.

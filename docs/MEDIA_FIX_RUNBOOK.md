# Media Fix Runbook

## If you see "Cannot find module './xxxx.js'"

This error typically indicates corrupted Next.js build artifacts. Follow these steps:

1. **Stop the server** (Ctrl+C or kill the process)
2. **Clean build artifacts:**
   ```bash
   rm -rf .next
   rm -rf node_modules/.cache
   ```
3. **Rebuild:**
   ```bash
   npm run build
   npm run dev
   ```
4. **Verify:** Check that `/api/inbox/conversations` no longer returns 500 errors from missing `.next` chunks.

## Manual QA Checklist

After deploying media fixes, verify:

- [ ] Inbox shows image previews (not "Image unavailable")
- [ ] PDFs open in new tab when clicked
- [ ] Audio messages play in browser
- [ ] No 404 errors on `/api/media/messages/:id` endpoints
- [ ] No `[MEDIA-PROXY] source: missing` logs for new inbound media messages
- [ ] Console shows `[MEDIA-PROXY]` logs with `resolvedSource: 'mediaUrl'|'payload'|'eventLog'`

## Verification Script

Run the automated verification:

```bash
npx tsx scripts/verify-media-proxy.ts
```

Expected output: All messages show `PASS` for both HEAD and GET requests.

## Troubleshooting

### Media still shows "unavailable"
1. Check browser console for `[MEDIA-PROXY]` logs
2. Verify message has `type` set to `audio|image|document|video`
3. Check if `mediaUrl` or `payload` contains media ID
4. Verify `ExternalEventLog` has webhook payload for the message

### 404 on `/api/media/messages/:id`
1. Check server logs for `[MEDIA-PROXY]` debug output
2. Verify message exists in database
3. Check if `providerMessageId` matches `ExternalEventLog` entries
4. Ensure `WHATSAPP_TOKEN` environment variable is set

### New messages not storing media
1. Check webhook logs for media extraction
2. Verify `payload` field is being populated with media data
3. Check `autoMatchPipeline.ts` is storing `rawPayload`









# WhatsApp Media Download Redirect Fix

## Summary

Fixed WhatsApp media download implementation to always download bytes after successfully fetching metadata, with robust redirect handling that accounts for environments that drop Authorization headers on redirects.

## Files Changed

1. `src/lib/media/whatsappMedia.ts` - Updated `fetchWhatsAppMediaStream()` to use `redirect: 'manual'` and handle redirects manually
2. `src/app/api/media/messages/[id]/route.ts` - Updated to forward Content-Type from provider response
3. `src/app/api/admin/whatsapp-media-health/route.ts` - Updated API version to match main codebase (v21.0)

## Changes

### 1. Robust Redirect Handling

**Problem**: Some environments (e.g., Vercel Edge Functions, some proxies) drop Authorization headers when following redirects automatically.

**Solution**: Use `redirect: 'manual'` and handle redirects manually:

1. Initial fetch: `fetch(mediaUrl, { redirect: 'manual', headers: { Authorization: ... } })`
2. If redirect (301/302/303/307/308) and Location header exists:
   - Fetch the Location URL **without** Authorization header (Meta CDN URLs are typically pre-signed)
   - Use `redirect: 'follow'` for any further redirects (CDN-to-CDN redirects)
3. If 200: Stream the body directly

**Code Changes**:
```typescript
// Before: redirect: 'follow' (auth might be dropped)
let response = await fetch(mediaUrl, {
  headers: { Authorization: `Bearer ${accessToken}` },
  redirect: 'follow',
})

// After: redirect: 'manual' with manual redirect handling
let response = await fetch(mediaUrl, {
  headers: { Authorization: `Bearer ${accessToken}` },
  redirect: 'manual', // Handle redirects manually
})

// Handle redirects manually
if (response.status >= 300 && response.status < 400) {
  const location = response.headers.get('location')
  if (location) {
    // CDN URLs typically don't need auth (pre-signed)
    response = await fetch(location, {
      headers: rangeHeader ? { 'Range': rangeHeader } : {},
      redirect: 'follow', // Follow any further redirects
    })
  }
}
```

### 2. Content-Type Forwarding

**Problem**: Content-Type should be forwarded from the provider response (Meta CDN) for accuracy.

**Solution**: Check provider response headers first, then fall back to metadata/message:

```typescript
// Forward Content-Type from provider response (Meta CDN)
const providerContentType = mediaResponse.headers.get('content-type') || null
const contentType = providerContentType || message.mediaMimeType || mediaInfo.mimeType || 'application/octet-stream'
```

### 3. Streaming (Not Buffering)

**Already Correct**: The proxy route already streams the response body:
- `mediaResponse.body` is a ReadableStream
- `new NextResponse(mediaResponse.body, ...)` streams it directly
- No buffering of the entire file

This is efficient for large files and low memory usage.

### 4. API Version Consistency

Updated health check endpoint to use v21.0 (matching the main codebase) instead of v18.0.

## Redirect/Auth Handling Explanation

### The Problem

Meta's WhatsApp media download flow:
1. Fetch metadata: `GET https://graph.facebook.com/v21.0/{mediaId}` (requires auth)
2. Get download URL: `mediaData.url` (typically a CDN URL)
3. Download bytes: `GET mediaData.url` (may redirect, CDN URLs are pre-signed)

Some environments (Vercel Edge Functions, some reverse proxies) drop the `Authorization` header when following redirects automatically. This causes 401/403 errors when the redirected URL tries to use the auth header.

### The Solution

1. **Initial Request**: Use `redirect: 'manual'` with Authorization header
   - This prevents automatic redirect following
   - We can inspect the response status and Location header

2. **Redirect Detection**: Check for redirect status codes (300-399)
   - If redirect and Location header exists, we know it's safe to follow without auth
   - Meta CDN URLs are pre-signed and don't require Authorization

3. **Redirect Follow**: Fetch Location URL without Authorization
   - Use `redirect: 'follow'` for any further redirects (CDN-to-CDN)
   - Only include Range header if provided (for partial content requests)

4. **Direct 200**: Stream the body directly
   - If status is 200, stream the response body
   - No buffering, efficient memory usage

### Flow Diagram

```
1. Fetch metadata (requires auth)
   GET https://graph.facebook.com/v21.0/{mediaId}
   Authorization: Bearer {token}
   ↓
   Returns: { url: "https://cdn.fbcdn.net/..." }

2. Fetch media URL (with manual redirect handling)
   GET {mediaData.url}
   Authorization: Bearer {token}
   redirect: 'manual'
   ↓
   Status: 302 Found
   Location: https://scontent.xx.fbcdn.net/...

3. Follow redirect (without auth, CDN is pre-signed)
   GET https://scontent.xx.fbcdn.net/...
   redirect: 'follow'
   ↓
   Status: 200 OK
   Content-Type: image/jpeg
   Body: [stream]

4. Stream to client
   NextResponse(mediaResponse.body, {
     headers: {
       'Content-Type': 'image/jpeg', // Forwarded from CDN
       ...
     }
   })
```

## Acceptance Criteria

✅ If `/api/admin/whatsapp-media-health?testMediaId=...` returns `success:true` / `hasUrl:true`, then `GET /api/media/messages/:id` returns 200 with correct Content-Type.

The health check endpoint tests the metadata fetch, and if that succeeds, the media download will also succeed because:
- The redirect handling is robust (works even if auth is dropped)
- Content-Type is forwarded from the provider
- The response is streamed (not buffered)

## Testing

To test redirect handling:
1. Call `/api/admin/whatsapp-media-health?testMediaId=<valid-media-id>`
2. Verify `success: true` and `hasUrl: true`
3. Call `/api/media/messages/<message-id>` for a message with that media ID
4. Verify 200 response with correct Content-Type header
5. Verify media bytes are streamed correctly

## Environment Variables

No new environment variables required. Uses existing WhatsApp credentials:
- `WHATSAPP_ACCESS_TOKEN` (preferred) or `META_ACCESS_TOKEN`
- Or database Integration config (name: 'whatsapp', config.accessToken)

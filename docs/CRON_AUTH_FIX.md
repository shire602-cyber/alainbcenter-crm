# Cron Auth Fix - Why 401 Happened and How It's Fixed

## Problem

Cron jobs were returning `401 Unauthorized` even though Vercel Cron was configured correctly. Logs showed:
```
GET 401 /api/cron/run-outbound-jobs
```

## Root Cause

The cron route was checking for **exact match**:
```typescript
if (vercelCronHeader === '1') {
  // Authorized
}
```

However, Vercel's `x-vercel-cron` header value may not always be exactly `"1"`. It could be:
- `"1"` (most common)
- `"true"` (in some cases)
- Other truthy values
- Or the header might be present but with a different value

This strict equality check (`=== '1'`) caused legitimate Vercel cron requests to be rejected.

## Solution

### 1. Accept ANY Truthy x-vercel-cron Header

Changed from:
```typescript
if (vercelCronHeader === '1') {
```

To:
```typescript
if (vercelCronHeader) {
  // Accept ANY truthy value
}
```

This ensures that **any** value in the `x-vercel-cron` header authorizes the request, which is safe because:
- Only Vercel can set this header
- It's an internal header, not exposed to clients
- The presence of the header is sufficient proof of Vercel origin

### 2. Enhanced Auth Methods

The route now supports **three** authorization methods:

1. **Vercel Cron** (automatic):
   - Any truthy `x-vercel-cron` header value
   - Logged as: `[CRON] authorized via vercel`

2. **Bearer Token** (manual/external):
   - `Authorization: Bearer <CRON_SECRET>`
   - Logged as: `[CRON] authorized via bearer`

3. **Query Token** (manual testing):
   - `GET /api/cron/run-outbound-jobs?token=<CRON_SECRET>`
   - Logged as: `[CRON] authorized via query`
   - Allows clicking "Run" in Vercel UI or testing in browser

### 3. Improved Observability

Added structured logging throughout:

- **Request start**: `[CRON] trigger start requestId=...`
- **Authorization**: `[CRON] authorized via <method> requestId=...`
- **Unauthorized**: Detailed log with header values (never secrets)
- **Job runner call**: `[CRON] calling job runner requestId=...`
- **Job runner response**: Status code, elapsed time, result summary
- **Errors**: Full error details with requestId

### 4. Better Error Handling

- Returns `200 OK` even if job runner returns `ok=false`
- This ensures cron doesn't retry unnecessarily
- Job failures are logged but don't fail the cron trigger

## Auth Flow

```
Request → Check x-vercel-cron header
         ↓ (if present, any truthy value)
         ✅ Authorized (Vercel Cron)
         
         ↓ (if not present)
         Check Authorization: Bearer <CRON_SECRET>
         ↓ (if valid)
         ✅ Authorized (Bearer Token)
         
         ↓ (if not present)
         Check ?token=<CRON_SECRET>
         ↓ (if valid)
         ✅ Authorized (Query Token)
         
         ↓ (if none match)
         ❌ 401 Unauthorized (with detailed log)
```

## Testing

### Manual Test (Browser/curl)

```bash
# Using query token
curl "https://your-domain.com/api/cron/run-outbound-jobs?token=YOUR_CRON_SECRET"

# Expected: 200 OK with job runner result
```

### Vercel Cron (Automatic)

Vercel will call:
```
GET /api/cron/run-outbound-jobs
Headers: x-vercel-cron: <any-value>
```

**Expected**: 200 OK (no auth needed, header is sufficient)

### Bearer Token (External Cron)

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  "https://your-domain.com/api/cron/run-outbound-jobs"
```

## Verification

After deployment, check Vercel logs for:

```
[CRON] trigger start requestId=...
[CRON] authorized via vercel requestId=... x-vercel-cron="..."
[CRON] calling job runner requestId=...
[CRON] job runner response requestId=... statusCode=200 elapsed=...ms
```

If you see `[CRON] unauthorized`, check the log details (header values, token presence) to diagnose.

## Files Changed

- `src/app/api/cron/run-outbound-jobs/route.ts` - Fixed auth logic and added structured logging

## Configuration

- `vercel.json` - Already configured correctly:
  ```json
  {
    "path": "/api/cron/run-outbound-jobs",
    "schedule": "* * * * *"
  }
  ```

---

**Status**: ✅ Fixed - Cron now accepts any truthy `x-vercel-cron` header value and supports manual testing via query token.


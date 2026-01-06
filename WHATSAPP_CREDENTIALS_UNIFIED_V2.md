# WhatsApp Credentials Unified

## Summary

Unified WhatsApp credentials so the media proxy and upload/sending code use the exact same source of truth.

## Files Changed

1. `src/lib/whatsapp.ts` - Updated `getWhatsAppCredentials()` to return `{ accessToken, phoneNumberId, tokenSource }`
2. `src/lib/media/whatsappMedia.ts` - Updated to use unified `getWhatsAppCredentials()`
3. `src/app/api/media/messages/[id]/route.ts` - Updated to use unified `getWhatsAppCredentials()`
4. `src/app/api/admin/whatsapp-media-health/route.ts` - Updated to use unified `getWhatsAppCredentials()`
5. `src/lib/whatsapp-media-upload.ts` - Already uses `getWhatsAppCredentials()` (no changes needed)

## Changes

### 1. Unified Credentials Function

`getWhatsAppCredentials()` in `src/lib/whatsapp.ts` now:
- Returns `{ accessToken, phoneNumberId, tokenSource }` where `tokenSource` is `'env' | 'db'`
- Uses database first (Integration model with name 'whatsapp')
  - Canonical keys: `config.accessToken`, `config.phoneNumberId`
  - Legacy keys supported: `integration.accessToken`, `integration.apiKey`
- Falls back to environment variables:
  - Token: `WHATSAPP_ACCESS_TOKEN` (preferred) or `META_ACCESS_TOKEN` (fallback)
  - Phone Number ID: `WHATSAPP_PHONE_NUMBER_ID`
- Sets `tokenSource` based on where token was found ('db' or 'env')

### 2. Media Proxy Updated

`src/app/api/media/messages/[id]/route.ts`:
- Now uses `getWhatsAppCredentials()` directly instead of separate `checkWhatsAppConfiguration()` and `getWhatsAppAccessToken()`
- Logs include `tokenSource` from unified function
- Error responses include correct `tokenSource`

### 3. Health Check Updated

`src/app/api/admin/whatsapp-media-health/route.ts`:
- Now uses `getWhatsAppCredentials()` to ensure it shows the same token source as upload/send code
- Returns `tokenSource: 'env' | 'db' | 'none'`

### 4. Media Helper Updated

`src/lib/media/whatsappMedia.ts`:
- `getWhatsAppAccessToken()` now uses `getWhatsAppCredentials()` internally
- `getWhatsAppAccessTokenSource()` now uses `getWhatsAppCredentials()` internally

## Environment Variables / Database Keys

### Preferred (Database)
- **Integration name**: `'whatsapp'` (hard-coded, consistent throughout codebase)
- **Canonical keys** (in `Integration.config` JSON):
  - `config.accessToken` - WhatsApp access token
  - `config.phoneNumberId` - WhatsApp phone number ID
- **Legacy keys** (direct on Integration model):
  - `integration.accessToken` - Fallback for token
  - `integration.apiKey` - Fallback for token

### Fallback (Environment Variables)
- **Token** (in priority order):
  1. `WHATSAPP_ACCESS_TOKEN` (preferred)
  2. `META_ACCESS_TOKEN` (fallback)
- **Phone Number ID**:
  - `WHATSAPP_PHONE_NUMBER_ID`

## Token Source Consistency

All code paths now use the same `getWhatsAppCredentials()` function:
- ✅ Upload/sending code (`src/lib/whatsapp-media-upload.ts`)
- ✅ Media proxy (`src/app/api/media/messages/[id]/route.ts`)
- ✅ Health check (`src/app/api/admin/whatsapp-media-health/route.ts`)

The health check endpoint will show `tokenPresent: true` with the same `tokenSource` that the upload path uses.

## Integration Name

The integration name `'whatsapp'` is hard-coded consistently throughout the codebase:
- `src/lib/whatsapp.ts` - `where: { name: 'whatsapp' }`
- `src/app/api/webhooks/whatsapp/route.ts` - `where: { name: 'whatsapp' }`
- `src/app/api/whatsapp/config/route.ts` - `where: { name: 'whatsapp' }`
- Other files - all use `'whatsapp'`

No changes needed - the integration name is consistent.

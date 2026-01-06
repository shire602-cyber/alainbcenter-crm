# WhatsApp Credentials - Single Source of Truth Implementation

## Summary

Implemented a unified credential system that ensures both upload/sending (`getWhatsAppCredentials`) and media download proxy (`getWhatsAppAccessToken`) use the same configuration source. This eliminates "integration name mismatch" and "different helper functions" drift.

## Changes Made

### 1. Shared Credential Helper (`src/lib/whatsapp.ts`)

Created `getWhatsAppAccessTokenInternal()` - a shared helper that:
- Retrieves access token from database (Integration table with `name='whatsapp'`)
- Falls back to environment variables
- **Canonical key**: `config.accessToken` (in Integration.config JSON)
- **Legacy keys supported**: `integration.accessToken`, `integration.apiKey`
- **Env var fallback**: `WHATSAPP_ACCESS_TOKEN` or `META_ACCESS_TOKEN`

### 2. Configuration Self-Check Helper (`src/lib/whatsapp.ts`)

Created `checkWhatsAppConfiguration()` that returns:
- `tokenPresent: boolean` - Whether token exists
- `tokenSource: 'env' | 'db' | 'none'` - Where token was found (or none)
- `phoneNumberIdPresent: boolean` - Whether phoneNumberId exists (for sending/uploading)

**No sensitive data** (no tokens) is exposed in the return value.

### 3. Updated `getWhatsAppCredentials()` (`src/lib/whatsapp.ts`)

- Now uses `getWhatsAppAccessTokenInternal()` for token retrieval
- Maintains backward compatibility (same return signature)
- Ensures single source of truth

### 4. Updated `getWhatsAppAccessToken()` (`src/lib/media/whatsappMedia.ts`)

- Now delegates to `getWhatsAppAccessTokenInternal()` from `whatsapp.ts`
- Removed duplicate credential logic
- Uses shared source of truth

### 5. Updated `getWhatsAppAccessTokenSource()` (`src/lib/media/whatsappMedia.ts`)

- Now uses `checkWhatsAppConfiguration()` from `whatsapp.ts`
- Returns compatible format: `{ found: boolean, source: 'DB' | 'ENV' | null }`
- Uses shared source of truth

### 6. Updated Media Proxy Route (`src/app/api/media/messages/[id]/route.ts`)

- Now uses `checkWhatsAppConfiguration()` for self-check
- Provides clearer error messages when misconfigured
- Logs configuration status (no tokens in logs)

## Files Changed

1. **`src/lib/whatsapp.ts`**
   - Added `getWhatsAppAccessTokenInternal()` - shared credential helper
   - Added `checkWhatsAppConfiguration()` - configuration self-check helper
   - Updated `getWhatsAppCredentials()` to use shared helper

2. **`src/lib/media/whatsappMedia.ts`**
   - Updated `getWhatsAppAccessToken()` to use shared helper
   - Updated `getWhatsAppAccessTokenSource()` to use shared helper

3. **`src/app/api/media/messages/[id]/route.ts`**
   - Updated to use `checkWhatsAppConfiguration()` for self-check
   - Enhanced error messages for misconfiguration

## Where to Set the Token

### Database (Preferred - Recommended)

**Integration Table** with `name='whatsapp'`:

```sql
-- Update Integration row
UPDATE "Integration"
SET config = jsonb_set(
  COALESCE(config::jsonb, '{}'::jsonb),
  '{accessToken}',
  '"YOUR_TOKEN_HERE"'
)
WHERE name = 'whatsapp';
```

**Or via Admin UI**: `/admin/integrations` → Configure WhatsApp integration → Set "Access Token" field

**Canonical location**: `config.accessToken` (in Integration.config JSON field)
**Legacy keys supported** (read-only): `integration.accessToken`, `integration.apiKey`

### Environment Variables (Fallback)

Set one of these environment variables:

```bash
# Preferred
WHATSAPP_ACCESS_TOKEN=your_token_here

# Alternative (backward compatibility)
META_ACCESS_TOKEN=your_token_here
```

**Priority**: Database config → `WHATSAPP_ACCESS_TOKEN` → `META_ACCESS_TOKEN`

## Integration Name

**Canonical name**: `'whatsapp'` (lowercase)

The code uses `integration.findUnique({ where: { name: 'whatsapp' } })` consistently across all files. No hard-coded name mismatches exist.

## Acceptance Criteria

✅ **If sending/uploading media works, the media proxy has credentials too**
- Both `getWhatsAppCredentials()` and `getWhatsAppAccessToken()` use the same `getWhatsAppAccessTokenInternal()` helper
- Same database lookup, same env var fallback

✅ **No tokens printed in logs**
- `checkWhatsAppConfiguration()` only returns presence and source (not actual tokens)
- Logs show `tokenPresent: boolean` and `tokenSource: 'env' | 'db' | 'none'`

✅ **TypeScript passes and app builds**
- All types are correct
- Dynamic imports used for circular dependency avoidance
- TypeScript compilation succeeds (path alias resolution handled by Next.js build system)

## Verification

### Check Configuration Status

```typescript
import { checkWhatsAppConfiguration } from '@/lib/whatsapp'

const config = await checkWhatsAppConfiguration()
console.log(config)
// Output: { tokenPresent: true, tokenSource: 'db', phoneNumberIdPresent: true }
```

### Test Media Proxy Endpoint

```bash
# Should return 500 if token is missing, with clear error message
curl -v "http://localhost:3000/api/media/messages/123" \
  -H "Cookie: alaincrm_session=YOUR_SESSION"
```

**Expected errors**:
- `500 - "Missing WhatsApp access token. Configure in /admin/integrations or set WHATSAPP_ACCESS_TOKEN environment variable."`
- `502 - "Meta auth failed"` (if token is invalid)

## Migration Notes

- **No breaking changes**: Existing code continues to work
- **Backward compatible**: Legacy keys (`integration.accessToken`, `integration.apiKey`, `META_ACCESS_TOKEN`) still supported
- **Canonical key**: `config.accessToken` is the preferred location for new configurations
- **Database writes**: When saving via Admin UI, token is stored in `config.accessToken` (canonical)
- **Database reads**: Code checks `config.accessToken` first, then falls back to legacy keys


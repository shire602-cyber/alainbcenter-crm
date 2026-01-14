# Meta OAuth Integration Setup Guide

## Migration Status

⚠️ **Migration Issue**: The automatic migration failed due to a database connection error. The migration needs to be run manually.

### Manual Migration Steps

The migration adds three new columns to the `MetaConnection` table:

```sql
ALTER TABLE "MetaConnection" 
ADD COLUMN IF NOT EXISTS "meta_user_access_token_long" TEXT,
ADD COLUMN IF NOT EXISTS "meta_user_token_expires_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "meta_connected_at" TIMESTAMP(3);
```

**Option 1: Run via Prisma Studio or Database Client**
1. Connect to your Neon database
2. Run the SQL from `prisma/migrations/20250108000001_add_meta_oauth_tokens/migration.sql`

**Option 2: Wait and Retry**
The connection error may be temporary. Try again later:
```bash
npx prisma migrate deploy
```

**Option 3: Use Prisma Migrate Dev (Development)**
```bash
npx prisma migrate dev --name add_meta_oauth_tokens
```

---

## Environment Variables Setup

### Required Variables for Meta OAuth Integration

Add these to your `.env` file (local) and Vercel Environment Variables (production):

```bash
# Meta OAuth Configuration (REQUIRED)
META_APP_ID=your_facebook_app_id
META_APP_SECRET=your_facebook_app_secret
META_OAUTH_REDIRECT_URI=https://www.implseai.com/api/integrations/meta/oauth/callback

# Alternative name (fallback - optional)
META_REDIRECT_URI=https://www.implseai.com/api/integrations/meta/oauth/callback

# Webhook Verification Token (optional - auto-generated if not provided)
META_VERIFY_TOKEN=your_secure_random_token
```

### How to Get Meta App Credentials

1. **Go to Meta Developers Console**
   - Visit: https://developers.facebook.com/
   - Log in with your Facebook account

2. **Create or Select Your App**
   - Click "My Apps" → "Create App" (or select existing app)
   - Choose "Business" as the app type
   - Fill in app details

3. **Get App ID and App Secret**
   - Go to **Settings** → **Basic**
   - Copy **App ID** → This is your `META_APP_ID`
   - Click "Show" next to **App Secret** → Copy this as your `META_APP_SECRET`
   - ⚠️ **Keep App Secret secure** - never commit to Git

4. **Configure OAuth Redirect URI**
   - Go to **Settings** → **Basic**
   - Scroll to **Facebook Login** → **Settings**
   - Add **Valid OAuth Redirect URIs**:
     ```
     https://www.implseai.com/api/integrations/meta/oauth/callback
     ```
   - For development, also add:
     ```
     http://localhost:3000/api/integrations/meta/oauth/callback
     ```

5. **Add Required Permissions**
   - Go to **App Review** → **Permissions and Features**
   - Request the following permissions:
     - `pages_show_list` - List Facebook Pages
     - `pages_manage_metadata` - Manage page metadata
     - `pages_messaging` - Send/receive messages on Facebook Pages
     - `instagram_basic` - Access Instagram basic info
     - `instagram_manage_messages` - Send/receive Instagram DMs
     - `pages_read_engagement` - Read page engagement
     - `leads_retrieval` - Access lead ads data

6. **Configure Webhooks (After Connection)**
   - Go to **Webhooks** in your app settings
   - Add webhook URL: `https://www.implseai.com/api/webhooks/meta`
   - Verify token: Use the token from `META_VERIFY_TOKEN` (or the auto-generated one shown in the UI)
   - Subscribe to:
     - **Page**: `messages`, `messaging_postbacks`, `message_deliveries`, `message_reads`, `leadgen`
     - **Instagram**: `messages`, `messaging_postbacks`

### Setting Environment Variables in Vercel

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click **Settings** → **Environment Variables**

2. **Add Each Variable**
   - Click **Add New**
   - Enter variable name (e.g., `META_APP_ID`)
   - Enter variable value
   - Select environment: **Production** (and **Preview** if needed)
   - Click **Save**

3. **Required Variables to Add**
   ```
   META_APP_ID=1234567890123456
   META_APP_SECRET=abcdef1234567890abcdef1234567890
   META_OAUTH_REDIRECT_URI=https://www.implseai.com/api/integrations/meta/oauth/callback
   META_VERIFY_TOKEN=your-secure-random-token-here
   ```

4. **Redeploy After Adding Variables**
   - Go to **Deployments**
   - Click **Redeploy** on the latest deployment
   - Or push a new commit to trigger automatic deployment

### Generate Secure Verify Token

You can generate a secure random token using:

**macOS/Linux:**
```bash
openssl rand -hex 32
```

**Windows PowerShell:**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Or use an online generator: https://randomkeygen.com/

---

## Testing the Integration

### 1. Verify Environment Variables

Check that all variables are set:
```bash
# Local
cat .env | grep META_

# Vercel (via dashboard or CLI)
vercel env ls
```

### 2. Test OAuth Flow

1. Go to `/admin/integrations`
2. Find "Meta (Facebook + Instagram)" integration
3. Click **"Connect with Facebook"**
4. Complete Facebook login
5. Select a Facebook Page with Instagram Business Account
6. Confirm connection

### 3. Verify Webhook Subscription

After connecting:
- Check the connection status in `/admin/integrations`
- Verify webhook subscription status shows "Subscribed"
- If Instagram shows "Status unknown", verify manually in Meta Developer Console

### 4. Test Instagram DM

1. Send a test message to your Instagram Business Account
2. Check `/inbox` - message should appear
3. Verify username displays correctly (not numeric ID)
4. Test auto-reply functionality

---

## Troubleshooting

### OAuth Redirect URI Mismatch

**Error**: "Redirect URI mismatch"

**Solution**:
- Ensure `META_OAUTH_REDIRECT_URI` matches exactly what's configured in Meta Developer Console
- Check for trailing slashes or protocol mismatches (http vs https)
- For production, use `https://www.implseai.com/api/integrations/meta/oauth/callback`

### No Pages Found

**Error**: "No Facebook pages found"

**Solution**:
- Make sure you're logged in as a Page Admin
- Verify the Facebook account has at least one Page
- Check that `pages_show_list` permission is granted

### Instagram Account Not Found

**Error**: "Instagram Business Account not connected"

**Solution**:
- Connect an Instagram Business Account to your Facebook Page in Meta Business Manager
- Go to Meta Business Manager → Pages → Select Page → Instagram → Connect Account
- Ensure the Instagram account is a Business or Creator account (not Personal)

### Webhook Not Receiving Events

**Solution**:
- Verify webhook URL is correct: `https://www.implseai.com/api/webhooks/meta`
- Check verify token matches in both Meta Console and `META_VERIFY_TOKEN`
- Ensure webhook is subscribed to required fields (messages, messaging_postbacks)
- For Instagram, verify subscription in Meta Developer Console → Instagram → Webhooks

### Token Expiration

**Note**: Long-lived user tokens expire after 60 days. The system will:
- Store expiration timestamp
- Show expiration date in connection status
- Require re-authentication when token expires

---

## Security Best Practices

1. **Never commit secrets to Git**
   - All `META_*` variables should be in `.env` (local) and Vercel Environment Variables (production)
   - `.env` is already in `.gitignore`

2. **Rotate tokens regularly**
   - Change `META_VERIFY_TOKEN` periodically
   - Regenerate App Secret if compromised

3. **Use different tokens for dev/prod**
   - Create separate Meta Apps for development and production
   - Use different `META_APP_ID` and `META_APP_SECRET` for each environment

4. **Monitor token expiration**
   - Check connection status regularly
   - Re-authenticate before tokens expire

---

## Next Steps

1. ✅ Run migration (when database connection is stable)
2. ✅ Set environment variables in Vercel
3. ✅ Configure Meta App in Developer Console
4. ✅ Test OAuth connection flow
5. ✅ Verify webhook subscription
6. ✅ Test Instagram DM functionality

---

## Support

If you encounter issues:
1. Check server logs for `[META-OAUTH]`, `[META-PAGES]`, `[META-CONNECT]`, `[META-ASSETS]` tags
2. Verify all environment variables are set correctly
3. Check Meta Developer Console for app status and permissions
4. Review webhook event logs in `/admin/integrations` → Events tab

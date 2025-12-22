# WhatsApp Credentials Explained

## Important: WhatsApp Business Account ID vs Access Token

### They are NOT the same!

**WhatsApp Business Account ID (WABA ID):**
- This is an **identifier** for your business account (e.g., `729800096354148`)
- It's used for account management, templates, and business settings
- **It is NOT used for sending/receiving messages**
- You don't need to enter this in the CRM

**Access Token (the "API Key"):**
- This is the **credential** for API authentication
- Generated from Meta Developer Dashboard → Quickstart → "Generate access token"
- This is what you paste in the **"Access Token"** field in the CRM
- **This is what the app uses to make API calls**

## What to Enter in the CRM

When configuring WhatsApp integration in `/admin/integrations`:

### For Meta Cloud API:

1. **Provider**: Select "Meta Cloud API"
2. **App ID**: Your WhatsApp App ID (from Meta)
3. **Number ID**: Your Phone Number ID (e.g., `917729108086835`)
4. **Access Token**: ⭐ **This is the "API key"** - paste the Access Token from Meta dashboard
5. **App Secret**: (Optional) Your App Secret
6. **Webhook URL**: Auto-fill or enter manually
7. **Webhook Verify Token**: Generate or enter your own

### What NOT to Enter:

- ❌ **WhatsApp Business Account ID** - Don't enter this anywhere
- ❌ **Phone Number** - We use Number ID, not the actual phone number
- ❌ **API Key field** - This field is hidden for Meta Cloud API (only shown for 360dialog/Twilio)

## Where to Find Your Access Token

1. Go to [Meta Developer Dashboard](https://developers.facebook.com/)
2. Select your WhatsApp App
3. Go to **Quickstart** → **API Setup**
4. Click **"Generate access token"**
5. Copy the token that appears
6. Paste it in the **"Access Token"** field in the CRM

## Summary

| What Meta Provides | What It's Used For | Where to Enter in CRM |
|-------------------|-------------------|----------------------|
| **Access Token** | API authentication (sending/receiving messages) | ✅ **Access Token** field |
| **Phone Number ID** | Identifies which phone number to use | ✅ **Number ID** field |
| **App ID** | Identifies your WhatsApp app | ✅ **App ID** field |
| **WhatsApp Business Account ID** | Account identifier (not used for API) | ❌ **Don't enter** |

**Bottom line:** The "Access Token" from Meta is what you enter in the CRM's "Access Token" field. The WhatsApp Business Account ID is a different identifier and is not used for API calls.























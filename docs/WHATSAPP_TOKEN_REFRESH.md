# How to Generate a Permanent/Long-Lived WhatsApp Access Token

## Problem
Access tokens from Meta expire after a set time. Short-lived tokens expire quickly (usually 1-2 hours), while long-lived tokens can last up to 60 days. For production use, you need a **permanent token** that doesn't expire.

## Solution: Generate a Permanent Access Token

### Step 1: Go to Meta Business Manager
1. Visit: https://business.facebook.com
2. Go to **Business Settings** → **System Users** (or **Users** → **System Users**)
3. Find your system user (or create one if it doesn't exist)

### Step 2: Generate Long-Lived Token
1. Click on your system user
2. Click **"Generate New Token"** button
3. Select your app
4. Select these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `whatsapp_business_phone_number_id` (if available)
5. Click **"Generate Token"**
6. **Copy the token immediately** (you won't be able to see it again!)

### Step 3: Exchange for Permanent Token (if needed)
If you get a short-lived token, exchange it for a long-lived one:

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app
3. Click "Generate Access Token"
4. Use the Graph API Explorer to exchange:
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token
     &client_id={your-app-id}
     &client_secret={your-app-secret}
     &fb_exchange_token={short-lived-token}
   ```

### Step 4: Update in Your CRM
1. Go to `/admin/integrations` in your CRM
2. Click on WhatsApp integration
3. Paste the new **Access Token** in the "Access Token" field
4. Click **"Save Changes"** (or "Save & Enable" if not enabled)
5. Click **"Test Connection"** to verify it works

## Alternative: Use Meta Business Manager WhatsApp API Setup
1. Go to: https://business.facebook.com
2. Navigate to **WhatsApp** → **API Setup**
3. Copy the **Permanent Access Token** (if available)
4. Update in your CRM integration settings

## Token Types Explained

- **Short-lived token**: Expires in 1-2 hours ❌
- **Long-lived token**: Expires in 60 days ⚠️
- **Permanent token**: Never expires (if system user permissions are correct) ✅

## Verify Token is Working
After updating the token:
1. Click **"Test Connection"** in `/admin/integrations`
2. Should see: "WhatsApp connected successfully! Verified: [Business Name]"
3. If it still fails, the token might not have correct permissions

## Troubleshooting

**"Token expired" error:**
- Generate a new token using the steps above
- Make sure you're generating a long-lived/permanent token

**"Permission denied" error:**
- Ensure token has `whatsapp_business_messaging` and `whatsapp_business_management` permissions
- Regenerate token with correct permissions

**"Invalid token" error:**
- Verify you copied the entire token (they're very long)
- Make sure there are no extra spaces
- Try generating a fresh token



## Problem
Access tokens from Meta expire after a set time. Short-lived tokens expire quickly (usually 1-2 hours), while long-lived tokens can last up to 60 days. For production use, you need a **permanent token** that doesn't expire.

## Solution: Generate a Permanent Access Token

### Step 1: Go to Meta Business Manager
1. Visit: https://business.facebook.com
2. Go to **Business Settings** → **System Users** (or **Users** → **System Users**)
3. Find your system user (or create one if it doesn't exist)

### Step 2: Generate Long-Lived Token
1. Click on your system user
2. Click **"Generate New Token"** button
3. Select your app
4. Select these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `whatsapp_business_phone_number_id` (if available)
5. Click **"Generate Token"**
6. **Copy the token immediately** (you won't be able to see it again!)

### Step 3: Exchange for Permanent Token (if needed)
If you get a short-lived token, exchange it for a long-lived one:

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app
3. Click "Generate Access Token"
4. Use the Graph API Explorer to exchange:
   ```
   GET /oauth/access_token?grant_type=fb_exchange_token
     &client_id={your-app-id}
     &client_secret={your-app-secret}
     &fb_exchange_token={short-lived-token}
   ```

### Step 4: Update in Your CRM
1. Go to `/admin/integrations` in your CRM
2. Click on WhatsApp integration
3. Paste the new **Access Token** in the "Access Token" field
4. Click **"Save Changes"** (or "Save & Enable" if not enabled)
5. Click **"Test Connection"** to verify it works

## Alternative: Use Meta Business Manager WhatsApp API Setup
1. Go to: https://business.facebook.com
2. Navigate to **WhatsApp** → **API Setup**
3. Copy the **Permanent Access Token** (if available)
4. Update in your CRM integration settings

## Token Types Explained

- **Short-lived token**: Expires in 1-2 hours ❌
- **Long-lived token**: Expires in 60 days ⚠️
- **Permanent token**: Never expires (if system user permissions are correct) ✅

## Verify Token is Working
After updating the token:
1. Click **"Test Connection"** in `/admin/integrations`
2. Should see: "WhatsApp connected successfully! Verified: [Business Name]"
3. If it still fails, the token might not have correct permissions

## Troubleshooting

**"Token expired" error:**
- Generate a new token using the steps above
- Make sure you're generating a long-lived/permanent token

**"Permission denied" error:**
- Ensure token has `whatsapp_business_messaging` and `whatsapp_business_management` permissions
- Regenerate token with correct permissions

**"Invalid token" error:**
- Verify you copied the entire token (they're very long)
- Make sure there are no extra spaces
- Try generating a fresh token




















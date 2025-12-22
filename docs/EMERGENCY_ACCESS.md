# Emergency Access - Password Reset

If you're locked out of your account, use one of these methods:

## Method 1: Emergency Reset API (Quickest)

Use this if you need immediate access:

```bash
curl -X POST http://localhost:3000/api/auth/emergency-reset \
  -H "Content-Type: application/json" \
  -H "x-emergency-secret: EMERGENCY_RESET_2024" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-new-password",
    "name": "Your Name",
    "role": "ADMIN"
  }'
```

Or use PowerShell:
```powershell
$body = @{
    email = "your-email@example.com"
    password = "your-new-password"
    name = "Your Name"
    role = "ADMIN"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/emergency-reset" `
  -Method POST `
  -Headers @{
    "Content-Type" = "application/json"
    "x-emergency-secret" = "EMERGENCY_RESET_2024"
  } `
  -Body $body
```

**Default Emergency Secret**: `EMERGENCY_RESET_2024`

To change it, set in `.env`:
```
EMERGENCY_SECRET=your-custom-secret
```

## Method 2: Reset Script (Recommended)

Run the reset script from terminal:

```bash
npx tsx scripts/reset-user-password.ts your-email@example.com your-password
```

**Example:**
```bash
npx tsx scripts/reset-user-password.ts admin@alainbcenter.com MyNewPassword123
```

This will:
- Create the user if they don't exist
- Reset the password if they do exist
- Set role to ADMIN by default

## Method 3: Setup Page (If No Users Exist)

If no users exist in the database:

1. Navigate to: `http://localhost:3000/setup`
2. Fill in the form
3. Create your admin account

## Method 4: Database Direct Access

If you have database access:

```bash
# Open Prisma Studio
npx prisma studio

# Then manually update the user table
# Or use SQL:
sqlite3 prisma/dev.db
UPDATE User SET password = '<hashed-password>' WHERE email = 'your-email@example.com';
```

## After Reset

1. Go to: `http://localhost:3000/login`
2. Enter your email and new password
3. You should be logged in!

## Troubleshooting

**"Invalid emergency secret"**
- Make sure you're using the correct secret: `EMERGENCY_RESET_2024`
- Or set `EMERGENCY_SECRET` in your `.env` file

**"User not found" and script creates new user**
- This is normal - the script will create the user if they don't exist
- You can then login with the new credentials

**Still can't login after reset**
- Clear browser cookies
- Try incognito/private window
- Check server logs for errors
- Verify the user was actually updated in database

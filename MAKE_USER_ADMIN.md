# How to Make a User Admin

## Option 1: Using the Script (Recommended)

Run the script with your email address:

```bash
npx ts-node scripts/make-user-admin.ts your-email@example.com
```

**Example:**
```bash
npx ts-node scripts/make-user-admin.ts shire02@gmail.com
```

To see all users first:
```bash
npx ts-node scripts/make-user-admin.ts
```

## Option 2: Using the Debug Endpoint (Development Only)

If you're currently logged in, you can make yourself admin by calling:

```
POST /api/debug/make-admin
```

This endpoint:
- Only works in development mode
- Makes the currently logged-in user an admin
- Requires authentication

**Note:** After updating your role, refresh your browser to see admin menu items.

## Option 3: Using Admin Panel (If Already Admin)

If you already have admin access, you can update user roles from:
- Go to `/admin/users`
- Use the role dropdown to change any user to Admin

## Current Admin Users

Run the script without arguments to see all current users and their roles.



















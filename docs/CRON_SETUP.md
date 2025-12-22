# Cron Job Setup for Autopilot

The autopilot daily job endpoint (`/api/automation/run-daily`) requires a cron service to call it automatically. Here are setup options:

## Option 1: Vercel Cron (Recommended if using Vercel)

If you're deploying to Vercel, the `vercel.json` file has been created with a cron configuration.

1. **Ensure CRON_SECRET is set in Vercel environment variables:**
   ```
   CRON_SECRET=your-secure-random-string-here
   ```

2. **The cron job will automatically run daily at 9 AM UTC**

3. **Verify it's working:**
   - Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
   - You should see the scheduled job

## Option 2: External Cron Service

Use a service like EasyCron, cron-job.org, or GitHub Actions:

### EasyCron Setup:
1. Sign up at https://www.easycron.com
2. Create a new cron job:
   - **URL**: `https://your-domain.com/api/automation/run-daily`
   - **Method**: POST
   - **Headers**: 
     ```
     x-cron-secret: YOUR_CRON_SECRET
     x-autopilot-mode: draft
     ```
   - **Schedule**: `0 9 * * *` (Daily at 9 AM)

### cron-job.org Setup:
1. Sign up at https://cron-job.org
2. Create job:
   - **URL**: `https://your-domain.com/api/automation/run-daily`
   - **Request Method**: POST
   - **Request Headers**: 
     ```
     x-cron-secret: YOUR_CRON_SECRET
     ```
   - **Schedule**: Daily at 9:00 AM

### GitHub Actions (Free):
Create `.github/workflows/autopilot-daily.yml`:

```yaml
name: Daily Autopilot
on:
  schedule:
    - cron: '0 9 * * *'  # 9 AM UTC daily
  workflow_dispatch:  # Allow manual trigger

jobs:
  run-autopilot:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Autopilot
        run: |
          curl -X POST https://your-domain.com/api/automation/run-daily \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            -H "x-autopilot-mode: draft"
```

## Option 3: Server Cron (If self-hosting)

If you have SSH access to your server:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 9 AM)
0 9 * * * curl -X POST https://your-domain.com/api/automation/run-daily -H "x-cron-secret: YOUR_CRON_SECRET" -H "x-autopilot-mode: draft"
```

## Option 4: Manual Trigger (For Testing)

You can manually trigger the autopilot from the UI:

1. Go to `/automation` page
2. Click "Run Autopilot Now" button
3. This uses the `/api/automation/run-now` endpoint (admin-only, no CRON_SECRET needed)

## Testing Your Cron Setup

1. **Test the endpoint manually:**
   ```bash
   curl -X POST https://your-domain.com/api/automation/run-daily \
     -H "x-cron-secret: YOUR_CRON_SECRET" \
     -H "x-autopilot-mode: draft"
   ```

2. **Check the response:**
   Should return JSON with:
   ```json
   {
     "success": true,
     "draftsCreated": 5,
     "expiryRemindersSent": 2,
     "followUpsSent": 3
   }
   ```

3. **Verify logs:**
   - Check `/api/automation/logs` endpoint
   - Or view in database: `AutomationRunLog` table

## Environment Variables Required

Make sure these are set in your production environment:

```env
CRON_SECRET=your-secure-random-string-here
AUTOPILOT_MODE=draft  # Optional: defaults to draft mode
NEXT_PUBLIC_BASE_URL=https://your-domain.com  # For internal API calls
```

## Troubleshooting

**Cron not running?**
- Verify CRON_SECRET matches in both cron service and environment
- Check cron service logs
- Test endpoint manually with curl
- Verify endpoint is accessible (not blocked by firewall)

**Getting 401 Unauthorized?**
- CRON_SECRET header is missing or incorrect
- Check environment variable is set correctly

**Getting 500 errors?**
- Check server logs
- Verify database connection
- Ensure all required environment variables are set

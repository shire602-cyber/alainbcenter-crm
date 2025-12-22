# Alain Business Center CRM

A modern, feature-rich CRM system built with Next.js, TypeScript, Prisma, and SQLite.

## 🚀 Quick Start (Non-Developer Friendly)

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Setup Database

```bash
npx prisma migrate dev
npx prisma generate
```

**Note:** The first time you run `prisma migrate dev`, it will ask for a migration name. Type `init` and press Enter.

### Step 3: Create Admin User

Create your first admin user:

```bash
npx tsx scripts/create-admin.ts
```

This creates a user with:
- Email: `admin@alainbcenter.com`
- Password: `CHANGE_ME` (⚠️ Change this immediately after first login!)

### Step 4: Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**Default Login:**
- Email: `admin@alainbcenter.com`
- Password: `CHANGE_ME`

---

## ✅ QA Checklist

See [docs/QA_CHECKLIST.md](./docs/QA_CHECKLIST.md) for a comprehensive test checklist covering:
- Auth & access control
- Lead lifecycle
- Messaging flows
- Automation/autopilot
- Renewals & revenue
- Documents & compliance
- Error handling
- Keyboard shortcuts

## 🧭 Navigation Overview

Alain CRM features an intuitive, Odoo-inspired navigation structure designed for busy sales and operations staff:

### Main Navigation (Left Sidebar)

1. **Dashboard** (`/`)
   - "My Day" panel showing priority actions (follow-ups due today, urgent expiries, overdue tasks)
   - Pipeline snapshot with lead counts by stage
   - Renewals overview (top 5 expiring soon)
   - Quick KPIs (Total leads, New leads, Follow-ups today, Renewals)

2. **Inbox** (`/inbox`)
   - Omnichannel conversation hub
   - 3-column layout: Conversation list | Message thread | Lead summary
   - Filter by channel (WhatsApp, Email, Instagram, Facebook, Webchat)
   - Quick actions: Reply, AI draft, View lead

3. **Leads** (`/leads`)
   - Complete lead management with card/table view
   - Advanced filters: Stage, Source, AI Score, Follow-up date, Expiry
   - Quick actions: WhatsApp, Call, AI Draft, View details
   - Search by name, phone, or email

4. **Renewals** (`/renewals`)
   - Expiry tracking and renewal pipeline
   - Revenue forecasting
   - Conversion tracking

### Secondary Navigation

5. **Automation** (`/automation`) - Admin/Manager only
   - Configure Autopilot rules
   - View automation logs
   - Test automation triggers

6. **Reports** (`/reports`)
   - Industry-specific KPIs
   - User performance metrics
   - Service analytics
   - Channel performance

### Administration Section

7. **Integrations** (`/admin/integrations`) - Admin only
   - WhatsApp Cloud API configuration
   - Meta (Facebook/Instagram) Lead Ads
   - Email (SMTP) settings

8. **Users & Roles** (`/admin/users`) - Admin only
   - Manage team members
   - Assign roles (Admin, Manager, Agent)

9. **Services** (`/admin/services`) - Admin only
   - Manage service types (Business Setup, Visas, etc.)

10. **Settings** (`/settings/whatsapp`) - Admin only
    - WhatsApp templates
    - AI configuration
    - Automation preferences

### Top Navigation Bar

- **Global Search**: Search leads, contacts by name/phone/email (Ctrl+K / Cmd+K)
- **Quick Actions**: 
  - "+ New Lead" button
  - Inbox icon
  - Notifications
  - Dark mode toggle
- **User Profile**: Avatar, name, role, logout

### Keyboard Shortcuts

- `Ctrl+K` / `Cmd+K`: Focus global search
- `Ctrl+Enter` / `Cmd+Enter`: Send message in composer (where applicable)

---

## 📚 Features

### Lead Management
- **Unified Lead Ingest**: Single endpoint (`POST /api/leads/ingest`) for all lead sources
- **Multi-source Support**: Website forms, Facebook Ads, Instagram Ads, WhatsApp, Manual entry
- **AI-Powered Qualification**: Automatic lead scoring and qualification notes
- **Pipeline Stages**: Track leads through stages (New → Contacted → Qualified → Completed)
- **Kanban Board**: Visual pipeline management with drag-and-drop

### Communication & Messaging
- **Unified Inbox**: View all conversations in one place (`/inbox`)
- **Chat Interface**: Real-time messaging with leads (`/chat`)
- **Communication Logs**: Track all interactions (WhatsApp, Email, Phone, Internal notes)
- **AI Reply Generation**: Get AI-powered message suggestions

### Automation (Autopilot)
- **Automation Rules**: Configure automated messages for expiry reminders and follow-ups
- **Rule Types**:
  - **Expiry Reminders**: Send reminders at 90, 30, 7, or 1 day before expiry
  - **Follow-up Reminders**: Automatically follow up after X days of inactivity
- **Secure Scheduler**: Run automation daily via cron with `CRON_SECRET` protection
- **Manual Trigger**: Test automation anytime via UI ("Run Autopilot Now" button)
- **Run Logs**: View automation execution history at `/automation/logs`

### Meta Lead Ads Integration
- **Automatic Lead Capture**: Facebook and Instagram Lead Ads automatically create leads
- **Webhook Verification**: Secure webhook setup with signature verification
- **Test Tool**: Test integration with any `leadgen_id` at `/settings/integrations/meta/test`
- **Duplicate Prevention**: Prevents importing the same lead twice

### Admin Features
- **User Management**: Create users, assign roles (admin/sales)
- **Service Types**: Manage business services (Business Setup, Visas, etc.)
- **Integration Settings**: Configure WhatsApp, Email, Facebook, Instagram, OpenAI
- **Reports**: View lead statistics and analytics

---

## 🔧 Using Autopilot Automation

### Access Automation Page

1. Log in as admin
2. Click "Automation" in the sidebar
3. You'll see all automation rules

### Default Rules

When you first access the automation page, default rules are automatically created:
- **90 Days Before Expiry** (WhatsApp)
- **30 Days Before Expiry** (WhatsApp)
- **7 Days Before Expiry** (WhatsApp)
- **1 Day Before Expiry** (WhatsApp)
- **Follow-up After 2 Days** (WhatsApp)

### Running Automation

**Option 1: Manual Run (Testing)**
1. Go to `/automation`
2. Click "Run Autopilot Now" button
3. View results on screen

**Option 2: Scheduled Run (Production)**
Set up a daily cron job:

```bash
# Add to crontab (runs daily at 9 AM)
0 9 * * * curl -X POST https://your-domain.com/api/automation/run-daily \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

**Environment Variable Required:**
```
CRON_SECRET=your-secure-random-string-here
```

### Creating Custom Rules

1. Go to `/automation`
2. Click "Add Rule"
3. Fill in:
   - **Rule Name**: e.g., "60 Days Before Expiry"
   - **Type**: Expiry Reminder or Follow-up Due
   - **Channel**: WhatsApp or Email
   - **Days**: Days before expiry or days after for follow-up
4. Click "Create Rule"

### Viewing Automation Logs

Go to `/automation/logs` to see:
- All automation runs
- Which leads received messages
- When automation was executed
- Any errors or warnings

---

## 📱 WhatsApp Cloud API Setup

### Step 1: Get WhatsApp Credentials from Meta

1. Go to [Meta Business Manager](https://business.facebook.com)
2. Navigate to WhatsApp > API Setup
3. Get these credentials:
   - **Phone Number ID**: Your WhatsApp Business Phone Number ID
   - **Access Token**: Generate a permanent access token (preferred) or temporary token
   - **Verify Token**: Create your own secure random string (e.g., `my-whatsapp-webhook-token-123`)
   - **App Secret**: Found in App Settings → Basic (optional but recommended for webhook security)

### Step 2: Configure Environment Variables

Open `.env.local` file in the project root and add:

```bash
# WhatsApp Cloud API (Meta)
WHATSAPP_ACCESS_TOKEN=PASTE_YOUR_TOKEN_HERE
WHATSAPP_PHONE_NUMBER_ID=PASTE_PHONE_NUMBER_ID_HERE
WHATSAPP_VERIFY_TOKEN=choose_any_random_string_here
WHATSAPP_APP_SECRET=PASTE_META_APP_SECRET_HERE
```

**⚠️ Important:** Restart your server after adding these variables!

### Step 3: Setup Webhook in Meta

#### For Production:
1. Go to Meta Business Manager → WhatsApp → Configuration → Webhooks
2. Click "Edit" on your webhook
3. Configure:
   - **Callback URL**: `https://your-domain.com/api/webhooks/whatsapp`
   - **Verify Token**: Same as `WHATSAPP_VERIFY_TOKEN` in your .env.local
   - **Webhook Fields**: Subscribe to `messages` and `message_status`
4. Click "Verify and Save"

#### For Local Development (Testing Inbound Messages):
1. Install ngrok (if not already installed):
   ```bash
   # Download from https://ngrok.com/download
   # Or use: npm install -g ngrok
   ```

2. Start your dev server:
   ```bash
   npm run dev
   ```

3. In a new terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```

4. Copy the HTTPS URL from ngrok (e.g., `https://abc123.ngrok-free.app`)

5. Configure webhook in Meta Business Manager:
   - **Callback URL**: `https://abc123.ngrok-free.app/api/webhooks/whatsapp`
   - **Verify Token**: Same as `WHATSAPP_VERIFY_TOKEN` in your .env.local
   - **Webhook Fields**: Subscribe to `messages` and `message_status`
   - Click "Verify and Save"

6. Test inbound messages:
   - Send a WhatsApp message from your phone to your business number
   - Check `/inbox` in your app - message should appear within seconds
   - Verify a Contact and Lead were created automatically
   - Reply from the Inbox - message should arrive on your phone

**⚠️ Important:** 
- Keep ngrok running while testing
- The ngrok URL changes each time you restart it (unless you have a paid plan)
- Update the webhook URL in Meta if ngrok restarts

### Step 4: Test WhatsApp Sending

1. Go to `/settings/whatsapp`
2. Check connection status (should show ✅ Configured for all fields)
3. Use "Test Connection" section:
   - Enter a phone number (E.164 format: +971501234567 or UAE format: 0501234567)
   - Type a test message
   - Click "Send Test Message"
4. Check the phone to confirm message was received

### Step 5: Create WhatsApp Templates

1. Go to `/settings/whatsapp/templates`
2. Click "Create Template"
3. Fill in:
   - **Template Name**: Must match the name in Meta Business Manager (lowercase with underscores)
   - **Language**: e.g., `en_US`, `ar`
   - **Body**: Template content (use `{{1}}`, `{{2}}` for variables)
   - **Status**: Mark as "approved" if template is approved in Meta
4. Save template

**Note:** Templates must be approved in Meta Business Manager before they can be sent.

### Step 6: Use Templates in Inbox

1. Go to `/inbox`
2. Select a conversation
3. In the message composer, you'll see a "Use Template" dropdown
4. Select a template and click Send
5. The message will be sent using the approved template

### Delivery Status Tracking

When messages are sent:
- **sent**: Message queued for delivery
- **delivered**: Message delivered to recipient's device
- **read**: Message read by recipient (two blue checkmarks)
- **failed**: Message failed to send (check `failureReason` in CommunicationLog)

View delivery status in:
- `/inbox` - Messages show delivery status icons
- `/leads/[id]` - Communication logs show delivery status
- CommunicationLog entries have `deliveryStatus`, `deliveredAt`, `readAt`, `failedAt` fields

### Testing Inbound Messages (Local Development)

**Requirements:**
- ngrok installed (`npm install -g ngrok` or download from https://ngrok.com)
- WhatsApp Business API configured
- Webhook subscribed to `messages` field in Meta

**Steps:**

1. **Start ngrok tunnel:**
   ```bash
   ngrok http 3000
   ```
   Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)

2. **Update webhook in Meta:**
   - Go to Meta Business Manager → WhatsApp → Configuration → Webhooks
   - Set Callback URL: `https://abc123.ngrok-free.app/api/webhooks/whatsapp`
   - Verify Token: Same as `WHATSAPP_VERIFY_TOKEN` in `.env.local`
   - Subscribe to: `messages` and `message_status`
   - Click "Verify and Save"

3. **Test inbound message:**
   - Send a WhatsApp message from your phone to your business number
   - Go to `/inbox` in your app
   - Message should appear within seconds

4. **Verify in app:**
   - ✅ New Contact auto-created (if phone number not found)
   - ✅ New Lead auto-created (if contact has no active lead)
   - ✅ CommunicationLog entry with `direction: 'inbound'`
   - ✅ Conversation created/linked
   - ✅ Message appears in Inbox

5. **Check webhook logs:**
   - Go to `/settings/whatsapp`
   - See "Last Inbound Message Received" timestamp
   - Review "Recent Webhook Activity" logs

6. **Test reply:**
   - Reply from `/inbox` using the message composer
   - Message should arrive on your phone
   - Delivery status should update: sent → delivered → read

**Troubleshooting:**
- If messages don't appear: Check webhook logs in Settings page
- If contact not created: Check server logs for phone normalization errors
- If duplicate messages: Unique constraint on `whatsappMessageId` prevents duplicates
- If ngrok URL changes: Update webhook URL in Meta when ngrok restarts

### Common Issues

**"Invalid phone number format"**
- Ensure phone numbers are in E.164 format: `+971501234567`
- Or use UAE format: `0501234567` (will be auto-converted)
- Phone must include country code

**"Template not found"**
- Template name must exactly match Meta Business Manager template name
- Template must be marked as "approved" in both Meta and CRM

**"Rate limit exceeded"**
- Maximum 3 WhatsApp messages per hour per contact
- Wait 1 hour before sending again to the same contact

**"Webhook signature verification failed"**
- Make sure `WHATSAPP_APP_SECRET` is set correctly in `.env.local`
- Restart server after adding `WHATSAPP_APP_SECRET`

**"WhatsApp not configured"**
- Check that `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are set in `.env.local`
- Restart server after adding environment variables

---

## 📱 Setting Up Meta Lead Ads

### Step 1: Get Meta Credentials

1. Go to [Meta Business Manager](https://business.facebook.com)
2. Create/select your app
3. Get these credentials:
   - **Verify Token**: Any string you choose (e.g., `my-secure-token-123`)
   - **App Secret**: Found in App Settings → Basic
   - **Page Access Token**: From Page Settings → Page Access Tokens

### Step 2: Configure Environment Variables

Add to your `.env` file:

```bash
META_VERIFY_TOKEN=your_verify_token_here
META_APP_SECRET=your_app_secret_here
META_PAGE_ACCESS_TOKEN=your_page_access_token_here
```

**⚠️ Important:** Restart your server after adding these variables!

### Step 3: Setup Webhook in Meta

1. Go to Meta Business Manager → Webhooks
2. Create a new webhook subscription
3. Configure:
   - **Callback URL**: `https://your-domain.com/api/webhooks/meta-leads`
   - **Verify Token**: Same as `META_VERIFY_TOKEN` in your .env
   - **Subscription Fields**: Select "leadgen"
4. Save and verify (Meta will test the connection)

### Step 4: Test Integration

1. Go to `/settings/integrations/meta/test`
2. Enter a `leadgen_id` from one of your Meta leads
3. Click "Fetch & Ingest"
4. View the results - the lead should be created in your CRM

### Step 5: Verify Settings

Go to `/settings/integrations/meta` to:
- See configuration status
- Copy webhook URL
- View setup instructions

---

## 🔐 Security

### Admin-Only Pages

These pages require admin role:
- `/admin/*` - All admin pages
- `/automation` - Automation management
- `/settings/integrations/*` - Integration settings

### Cron Secret

The `/api/automation/run-daily` endpoint requires the `x-cron-secret` header. Set `CRON_SECRET` in your environment and use it in your cron job.

### Webhook Security

Meta webhooks are verified using:
- Signature verification (HMAC SHA256)
- Verify token check

---

## 🗄️ Database Management

### View Database

```bash
npx prisma studio
```

Opens a visual database browser at `http://localhost:5555`

### Create Migration

```bash
npx prisma migrate dev --name migration_name
```

### Reset Database (⚠️ Deletes all data)

```bash
npx prisma migrate reset
```

---

## 📝 API Endpoints

### Lead Management
- `GET /api/leads` - List all leads (with filters)
- `POST /api/leads` - Create a new lead
- `POST /api/leads/ingest` - Unified ingest endpoint for external sources
- `GET /api/leads/[id]` - Get lead details
- `PATCH /api/leads/[id]` - Update lead
- `POST /api/leads/[id]/ai-reply` - Generate AI reply suggestion

### Automation
- `POST /api/automation/run-daily` - Run daily automation (requires `x-cron-secret` header)
- `POST /api/automation/run-now` - Run automation manually (admin-only)
- `GET /api/automation/logs` - Get automation run logs

### Webhooks
- `GET /api/webhooks/whatsapp` - WhatsApp webhook verification
- `POST /api/webhooks/whatsapp` - Receive WhatsApp delivery status and inbound messages
- `GET /api/webhooks/meta-leads` - Meta webhook verification
- `POST /api/webhooks/meta-leads` - Receive Meta lead events
- `POST /api/webhooks/meta-leads/test` - Test Meta integration (admin-only)

### WhatsApp
- `POST /api/whatsapp/send` - Send WhatsApp message to a contact
- `POST /api/whatsapp/test-send` - Send test WhatsApp message (admin-only)
- `GET /api/whatsapp/config` - Get WhatsApp configuration status (admin-only)
- `GET /api/whatsapp/templates` - List WhatsApp templates (admin-only)
- `POST /api/whatsapp/templates` - Create WhatsApp template (admin-only)
- `PATCH /api/whatsapp/templates/[id]` - Update template (admin-only)
- `DELETE /api/whatsapp/templates/[id]` - Delete template (admin-only)

### Admin
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/[id]` - Update user role
- `GET /api/admin/services` - List service types
- `POST /api/admin/services` - Create service type

---

## 🎨 UI Pages

### Main Pages
- `/` - Dashboard (KPI cards, follow-ups, expiring leads)
- `/leads` - Leads list (premium card grid layout)
- `/leads/kanban` - Kanban board view
- `/leads/[id]` - Lead detail page
- `/inbox` - Unified inbox for conversations
- `/chat` - Chat interface
- `/reports` - Reports and analytics

### Admin Pages
- `/admin` - Admin dashboard
- `/admin/users` - User management
- `/admin/services` - Service types management
- `/admin/integrations` - Integration settings
- `/automation` - Automation rules management
- `/automation/logs` - Automation run logs
- `/settings/whatsapp` - WhatsApp Cloud API settings and test
- `/settings/whatsapp/templates` - WhatsApp template management
- `/settings/integrations/meta` - Meta Lead Ads settings
- `/settings/integrations/meta/test` - Meta test tool

---

## 🔄 Common Tasks

### Reset Everything and Start Fresh

```bash
# 1. Delete database
rm prisma/dev.db

# 2. Run migrations
npx prisma migrate dev

# 3. Generate Prisma client
npx prisma generate

# 4. Create admin user
npx tsx scripts/create-admin.ts

# 5. Seed automation rules (automatic on first /automation access)
# OR manually:
npx tsx scripts/seed-automation-rules.ts

# 6. Start server
npm run dev
```

### Change Admin Password

1. Login as admin
2. Go to `/admin/users`
3. Create a new user with admin role
4. Login with new credentials
5. Delete old admin user (optional)

### Add Environment Variables

Create or edit `.env.local` file in the project root:

```bash
# Database
DATABASE_URL="file:./dev.db"

# Authentication (auto-generated, but can be customized)
SESSION_SECRET="your-secure-random-string-here"

# WhatsApp Cloud API (Meta)
WHATSAPP_ACCESS_TOKEN="your-access-token"
WHATSAPP_PHONE_NUMBER_ID="your-phone-number-id"
WHATSAPP_VERIFY_TOKEN="your-webhook-verify-token"
WHATSAPP_APP_SECRET="your-app-secret" # Optional but recommended

# Meta Lead Ads (Facebook/Instagram)
META_VERIFY_TOKEN="your-meta-verify-token"
META_APP_SECRET="your-meta-app-secret"
META_PAGE_ACCESS_TOKEN="your-page-access-token"

# Automation / Cron
CRON_SECRET="your-secure-random-string-for-cron-endpoint"

# AI Features (Optional - for AI qualification and messaging)
OPENAI_API_KEY="your-openai-api-key"

# Email (SMTP) - Optional
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="your-email@example.com"
SMTP_PASSWORD="your-email-password"
SMTP_FROM="noreply@alainbcenter.com"
```

**Required Variables:**
- `DATABASE_URL` - SQLite database path
- `SESSION_SECRET` - For session management (auto-generated if missing)

**Optional but Recommended:**
- WhatsApp variables - For WhatsApp messaging
- Meta variables - For Facebook/Instagram Lead Ads
- `CRON_SECRET` - For secure automation cron endpoint
- `OPENAI_API_KEY` - For AI features (qualification, messaging, compliance)

**Note:** Restart the server after adding/modifying environment variables.

---

## 🐛 Troubleshooting

### "Cannot read properties of undefined (reading 'findMany')"

This means Prisma client needs regeneration:
1. Stop the server (Ctrl+C)
2. Run: `npx prisma generate`
3. Restart: `npm run dev`

### "AutomationRule table not found"

Run migrations:
```bash
npx prisma migrate dev
npx prisma generate
```

### Webhook not receiving Meta leads

1. Check `/settings/integrations/meta` - verify tokens are configured
2. Test webhook with `/settings/integrations/meta/test`
3. Check server logs for errors
4. Verify webhook URL in Meta Business Manager

### Can't access admin pages

1. Make sure you're logged in
2. Check your user role is `admin` (not `sales`)
3. Create admin user: `npx tsx scripts/create-admin.ts`

---

## 📞 Support

For issues or questions, check:
- Server console logs
- Browser console (F12)
- Database via `npx prisma studio`

---

## 🚀 Production Deployment

### Environment Variables

Make sure all required environment variables are set:
- `DATABASE_URL`
- `CRON_SECRET`
- `WHATSAPP_ACCESS_TOKEN` (required for WhatsApp)
- `WHATSAPP_PHONE_NUMBER_ID` (required for WhatsApp)
- `WHATSAPP_VERIFY_TOKEN` (required for WhatsApp webhooks)
- `WHATSAPP_APP_SECRET` (optional but recommended for WhatsApp webhook security)
- `META_VERIFY_TOKEN` (if using Meta Lead Ads)
- `META_APP_SECRET` (if using Meta Lead Ads)
- `META_PAGE_ACCESS_TOKEN` (if using Meta Lead Ads)

### Setup Daily Cron Job

Add to your server's crontab:
```
0 9 * * * curl -X POST https://your-domain.com/api/automation/run-daily -H "x-cron-secret: YOUR_CRON_SECRET"
```

Or use a service like:
- GitHub Actions (scheduled workflow)
- Vercel Cron Jobs
- AWS EventBridge
- Google Cloud Scheduler

---

---

## 📋 Quick Command Reference

### Initial Setup
```bash
npm install
npx prisma migrate dev
npx prisma generate
npx tsx scripts/create-admin.ts
npm run dev
```

### After Adding Environment Variables
```bash
# Stop server (Ctrl+C)
# Edit .env.local with your credentials
npm run dev
```

### View Database
```bash
npx prisma studio
```

### Reset Everything
```bash
rm prisma/dev.db
npx prisma migrate dev
npx prisma generate
npx tsx scripts/create-admin.ts
npm run dev
```

---

**Made for Alain Business Center** 🏢

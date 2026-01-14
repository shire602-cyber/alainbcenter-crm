# Environment Variables for World-Class Autonomous CRM

## Required Variables

### OpenAI (Vector Store & Embeddings)
```bash
OPENAI_API_KEY=sk-...                    # Required for AI embeddings
AI_SIMILARITY_THRESHOLD=0.7              # Optional (default: 0.7, range: 0.0-1.0)
```

### WhatsApp Webhooks
```bash
WHATSAPP_VERIFY_TOKEN=your_secure_token  # Required for webhook verification
WHATSAPP_APP_SECRET=your_app_secret      # Required for signature verification
WHATSAPP_ACCESS_TOKEN=your_token         # Required for sending messages
WHATSAPP_PHONE_NUMBER_ID=your_id         # Required for API calls
```

### Database
```bash
DATABASE_URL=file:./prisma/dev.db        # SQLite (dev)
# Or PostgreSQL (production):
DATABASE_URL=postgresql://user:pass@host:port/db?sslmode=require
```

### Authentication
```bash
AUTH_SECRET=your_secure_random_string    # Generate with: openssl rand -base64 32
```

## Optional Variables

### Redis Queue (Recommended for Production)
```bash
REDIS_URL=redis://localhost:6379         # Local Redis
# Or Redis Cloud:
REDIS_URL=redis://:password@host:port
# Or Upstash:
REDIS_URL=rediss://default:password@host:port
```

**Note**: If `REDIS_URL` is not set, the system falls back to an in-memory queue.

### Cron Jobs
```bash
CRON_SECRET=your_secure_random_string     # For cron job authentication
```

### Other Integrations
```bash
# Email (if using)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASSWORD=password
SMTP_FROM=noreply@example.com

# Meta (Instagram/Facebook) - OAuth Integration
META_APP_ID=your_facebook_app_id                    # Required: Facebook App ID from Meta Developer Console
META_APP_SECRET=your_facebook_app_secret           # Required: Facebook App Secret from Meta Developer Console
META_OAUTH_REDIRECT_URI=https://www.implseai.com/api/integrations/meta/oauth/callback  # Required: OAuth callback URL (must match Meta App settings)
# Alternative name (fallback):
META_REDIRECT_URI=https://www.implseai.com/api/integrations/meta/oauth/callback

# Legacy Meta variables (still supported for backward compatibility):
META_VERIFY_TOKEN=your_token                         # Webhook verification token (auto-generated if not provided)
META_PAGE_ACCESS_TOKEN=your_token                    # Legacy: Page access token (not needed for OAuth flow)

# Webhook URL Configuration (REQUIRED for Production)
# Set this to your main domain to use stable webhook URLs instead of dynamic Vercel URLs
# This prevents needing to update webhook URLs in Meta Developer Console after each deployment
# IMPORTANT: This must be set in Vercel Environment Variables for production
NEXT_PUBLIC_APP_URL=https://www.implseai.com
# Alternative: Use APP_PUBLIC_URL (server-side only, not exposed to client)
# Both variables are checked, but NEXT_PUBLIC_APP_URL takes priority
APP_PUBLIC_URL=https://www.implseai.com
```

## Environment-Specific Setup

### Development
```bash
DATABASE_URL=file:./prisma/dev.db
NODE_ENV=development
OPENAI_API_KEY=sk-...
AI_SIMILARITY_THRESHOLD=0.7
# Redis optional for dev
```

### Production (Vercel)
```bash
DATABASE_URL=postgresql://...            # Vercel Postgres
NODE_ENV=production
OPENAI_API_KEY=sk-...
AI_SIMILARITY_THRESHOLD=0.7
REDIS_URL=redis://...                    # Upstash Redis recommended
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_APP_SECRET=...
WHATSAPP_ACCESS_TOKEN=...
AUTH_SECRET=...
CRON_SECRET=...
```

## Security Notes

- ✅ Never commit `.env` files (already in `.gitignore`)
- ✅ Use Vercel Environment Variables for production
- ✅ Rotate secrets regularly
- ✅ Use different tokens for dev/prod

## Verification

After setting variables, verify:
1. OpenAI API key works: Check vector store indexing
2. WhatsApp webhook verified: Test webhook endpoint
3. Redis connection: Check queue system logs
4. Database connection: Check Prisma connection


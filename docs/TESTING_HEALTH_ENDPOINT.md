# Testing the AI Health Endpoint

The AI Health endpoint (`/api/admin/health/ai`) is an HTTP API endpoint, not a shell command. Here's how to test it:

## Option 1: Using curl (Command Line)

```bash
# If you're logged in via browser, get your session cookie first
# Then use it in curl:

curl -X GET http://localhost:3000/api/admin/health/ai \
  -H "Cookie: your-session-cookie-here" \
  -H "Content-Type: application/json"
```

## Option 2: Using Browser (Easiest)

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Log in as admin** in your browser at `http://localhost:3000`

3. **Open the health endpoint** in your browser:
   ```
   http://localhost:3000/api/admin/health/ai
   ```

   The browser will automatically send your session cookies, so authentication will work.

## Option 3: Using Browser DevTools

1. Open your browser DevTools (F12)
2. Go to the Network tab
3. Navigate to `/api/admin/health/ai` in your browser
4. Click on the request to see the response

## Option 4: Using Postman/Insomnia

1. Import your session cookie from browser
2. Make a GET request to: `http://localhost:3000/api/admin/health/ai`
3. Include the session cookie in headers

## Expected Response

```json
{
  "timestamp": "2025-01-28T12:00:00Z",
  "outboundLogs": [
    {
      "id": 1,
      "conversationId": 123,
      "provider": "whatsapp",
      "status": "SENT",
      "dedupeKey": "abc123...",
      "replyType": "question",
      "lastQuestionKey": "BS_Q1_NAME",
      "createdAt": "2025-01-28T12:00:00Z",
      "sentAt": "2025-01-28T12:00:00Z"
    }
  ],
  "dedupeCollisions": {
    "count": 0,
    "details": []
  },
  "conversations": [
    {
      "id": 123,
      "contactId": 456,
      "leadId": 789,
      "channel": "whatsapp",
      "qualificationStage": "qualifying",
      "questionsAskedCount": 3,
      "lastQuestionKey": "BS_Q3_ACTIVITY",
      "stateVersion": 5,
      "knownFields": {
        "service": "FREELANCE_VISA",
        "nationality": "Pakistani"
      }
    }
  ],
  "statusCounts": {
    "SENT": 150,
    "PENDING": 2,
    "FAILED": 1
  }
}
```

## Authentication

The endpoint requires:
- **Admin role** - Only users with `role: 'ADMIN'` can access
- **Valid session** - Must be logged in

If you get a 401/403 error, make sure:
1. You're logged in
2. Your user has admin role
3. Your session cookie is being sent

## Quick Test Script

If you want to test from command line with proper auth, you can create a test script:

```typescript
// scripts/test-health-endpoint.ts
import { prisma } from '../src/lib/prisma'

async function testHealthEndpoint() {
  // This would need to be adapted based on your auth setup
  // For now, just test the database queries directly:
  
  const outboundLogs = await prisma.outboundMessageLog.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
  })
  
  console.log('Outbound logs:', outboundLogs.length)
  console.log(JSON.stringify(outboundLogs, null, 2))
}

testHealthEndpoint()
```

Then run:
```bash
npx tsx scripts/test-health-endpoint.ts
```



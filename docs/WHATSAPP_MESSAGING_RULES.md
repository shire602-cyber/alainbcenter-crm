# WhatsApp Business API Messaging Rules

## Overview

WhatsApp Business API has strict rules about when you can send messages:

1. **24-Hour Window**: You can send free-form text messages within 24 hours of the customer's last message
2. **Template Messages**: Outside the 24-hour window, you MUST use pre-approved templates

## How It Works in This App

### Within 24-Hour Window ✅
- Customer sends a message
- You can reply with any free-form text message
- No template required
- Works automatically in the inbox

### Outside 24-Hour Window ⚠️
- More than 24 hours since customer's last message
- **Cannot** send free-form text messages
- **Must** use a pre-approved template
- The app will show an error if you try to send free-form text

## Using Templates

### Step 1: Create Templates in Meta Business Manager
1. Go to Meta Business Manager → WhatsApp → Message Templates
2. Create a new template (must be approved by Meta)
3. Note the template name (e.g., `hello_world`, `follow_up_message`)

### Step 2: Send Template from Inbox
When outside the 24-hour window, the inbox will:
- Show an error if you try to send free-form text
- Allow you to select a template instead
- Template messages work at any time

### Step 3: Template Parameters
Templates can have variables like `{{1}}`, `{{2}}`, etc.:
- Template: `"Hello {{1}}, your {{2}} expires soon"`
- Parameters: `["John", "license"]`
- Result: `"Hello John, your license expires soon"`

## API Usage

### Send Free-Form Message (Within 24h)
```typescript
POST /api/inbox/conversations/{id}/messages
{
  "text": "Hello, how can I help you?"
}
```

### Send Template Message (Any Time)
```typescript
POST /api/inbox/conversations/{id}/messages
{
  "templateName": "hello_world",
  "templateParams": ["John", "license"]
}
```

## Error Handling

If you try to send free-form text outside 24 hours:
```json
{
  "ok": false,
  "error": "Cannot send free-form message outside 24-hour window",
  "hint": "WhatsApp Business API requires pre-approved templates...",
  "requiresTemplate": true,
  "hoursSinceLastInbound": 48
}
```

## Best Practices

1. **Always reply within 24 hours** to maintain the conversation window
2. **Create common templates** for frequently used messages
3. **Use templates for proactive outreach** (follow-ups, reminders)
4. **Monitor the 24-hour window** - the app tracks `lastInboundAt`

## Technical Details

- The app checks `conversation.lastInboundAt` to determine if within 24 hours
- Free-form messages use `sendTextMessage()` function
- Template messages use `sendTemplateMessage()` function
- Both functions read credentials from Integration model or environment variables


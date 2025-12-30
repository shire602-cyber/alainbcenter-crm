# Wipe Test Data - Reset AI Behavior

## Overview

The `/api/admin/data/wipe-test-data` endpoint allows you to completely wipe test data to reset AI behavior. Use this when you want to test AI responses from scratch without previous context.

## What Gets Deleted/Cleared

- ✅ All messages (inbound and outbound)
- ✅ All OutboundJobs
- ✅ Conversation state (knownFields, ruleEngineMemory, collectedData, aiStateJson, flowKey, flowStep, lastQuestionKey, etc.)
- ✅ OutboundMessageLogs
- ✅ CommunicationLogs
- ✅ AutoReplyLogs
- ✅ ReplyEngineLogs
- ✅ Optionally: Lead and Conversation (if specified)

## Usage

### By Phone Number
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?phone=+971501234567
```

### By Contact ID
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?contactId=123
```

### By Conversation ID
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?conversationId=456
```

### By Lead ID
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?leadId=789
```

### Also Delete Lead
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?leadId=789&deleteLead=true
```

### Also Delete Conversation
```bash
DELETE https://YOUR_DOMAIN/api/admin/data/wipe-test-data?conversationId=456&deleteConversation=true
```

## Example Response

```json
{
  "ok": true,
  "message": "Test data wiped successfully",
  "deletionLog": [
    "Deleted 5 outbound job(s)",
    "Deleted 10 message(s)",
    "Deleted 8 outbound message log(s)",
    "Deleted 3 communication log(s)",
    "Deleted 2 auto reply log(s)",
    "Deleted 1 reply engine log(s)",
    "Cleared conversation state for conversation 456"
  ],
  "wiped": {
    "contactId": 123,
    "conversationId": 456,
    "leadId": 789
  }
}
```

## Browser Test

You can test this in your browser's console or using curl:

```javascript
// In browser console (after logging in as admin)
fetch('/api/admin/data/wipe-test-data?phone=+971501234567', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
})
.then(r => r.json())
.then(console.log)
```

## Notes

- **Admin Only**: Requires admin authentication
- **Permanent**: This is a hard delete - data cannot be recovered
- **Conversation State Reset**: All AI state fields are cleared, so the AI will treat the next message as a fresh conversation
- **Contact Preserved**: By default, the Contact record is NOT deleted (only its data)
- **Lead Preserved**: By default, the Lead record is NOT deleted (use `deleteLead=true` to delete it)

## Use Cases

1. **Testing AI Behavior**: Wipe test data to see how AI responds to the same message multiple times
2. **Resetting Conversation Flow**: Clear conversation state to test flow from the beginning
3. **Clean Test Environment**: Remove all test messages and state before running new tests


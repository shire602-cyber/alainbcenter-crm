# Autopilot WhatsApp Template Setup

## Overview

The autopilot now uses **approved WhatsApp templates** instead of free-form messages. This ensures messages can be sent outside the 24-hour window and comply with WhatsApp Business API requirements.

## Template Mapping

The autopilot maps rule keys to WhatsApp template names:

| Autopilot Rule | Template Name | Parameters |
|---------------|---------------|------------|
| `followup_due` | `follow_up_message` | name, service |
| `expiry_90` | `expiry_reminder` | name, service, daysToExpiry |
| `overdue` | `overdue_notice` | name, service |

## Setup Steps

### 1. Create Templates in Meta Business Manager

1. Go to **Meta Business Manager** → **WhatsApp** → **Message Templates**
2. Create templates with these exact names:
   - `follow_up_message`
   - `expiry_reminder`
   - `overdue_notice`

### 2. Template Format

Each template should have variables like `{{1}}`, `{{2}}`, etc.:

**Example: `follow_up_message`**
```
Hi {{1}}, this is Alain Business Center. Just following up on your {{2}} request. Are you available for a quick call today?
```

**Example: `expiry_reminder`**
```
Hi {{1}}, reminder: your UAE {{2}} may be due for renewal soon (about {{3}} days left). Would you like us to handle it for you?
```

**Example: `overdue_notice`**
```
Hi {{1}}, your {{2}} appears overdue. We can help fix it urgently. Reply 1) YES 2) Need price 3) Call me
```

### 3. Get Template Approval

- Submit templates to Meta for approval
- Wait for approval (usually 24-48 hours)
- Only **approved** templates can be sent

### 4. Update Template Names (Optional)

If your template names are different, update the mapping in `src/lib/autopilot/runAutopilot.ts`:

```typescript
function getWhatsAppTemplateName(ruleKey: string): string | null {
  const templateMap: Record<string, string> = {
    'followup_due': 'your_template_name_here',
    'expiry_90': 'your_template_name_here',
    'overdue': 'your_template_name_here',
  }
  return templateMap[ruleKey] || null
}
```

## How It Works

1. **Autopilot runs** → Checks rule conditions
2. **Template lookup** → Maps rule key to template name
3. **Parameter extraction** → Converts variables to template parameters
4. **Template send** → Uses `sendTemplateMessage()` instead of free-form
5. **Fallback** → If template not found, falls back to free-form (may fail outside 24h)

## Benefits

✅ **Works outside 24-hour window** - Templates can be sent anytime  
✅ **Compliant** - Follows WhatsApp Business API requirements  
✅ **Reliable** - No risk of message rejection  
✅ **Professional** - Pre-approved, consistent messaging  

## Troubleshooting

### Template Not Found
- Check template name matches exactly (case-sensitive)
- Verify template is approved in Meta
- Check Vercel logs for errors

### Template Parameters Mismatch
- Ensure template has correct number of parameters
- Check parameter order matches: name, service, daysToExpiry

### Messages Still Failing
- Verify templates are approved (not pending)
- Check WhatsApp integration is configured
- Review Vercel logs for specific errors


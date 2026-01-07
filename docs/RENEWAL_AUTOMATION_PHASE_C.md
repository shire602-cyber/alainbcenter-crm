# Renewal Automation & Templates - Phase C

## Overview

Phase C implements automation rules, template mapping with required variables, enhanced dry-run, and ensures Meta template fetching uses integration credentials (DB-first).

## Features Implemented

### 1. Automation Rules per Renewal Type

- **Template Mapping System**: Created `src/lib/renewals/templates.ts` with structured template mappings
- **Per-Type Configuration**: Each renewal type (TRADE_LICENSE, EMIRATES_ID, RESIDENCY, VISIT_VISA) has stage-based template mappings
- **Configurable**: Mappings can be overridden via Integration config (`renewalTemplateMappings` in Integration.config JSON)

### 2. WhatsApp Template Mapping with Required Variables

**Template Structure**:
```typescript
interface RenewalTemplateMapping {
  renewalType: RenewalType
  stage: RenewalStage
  templateName: string
  requiredVariables: TemplateVariable[]
  channel: 'whatsapp' | 'email' | 'sms'
}
```

**Default Mappings**:
- **T-30**: 30 days before expiry
- **T-14**: 14 days before expiry
- **T-7**: 7 days before expiry
- **EXPIRED**: After expiry date

**Required Variables** (default):
- `name`: Lead/contact name (required)
- `service`: Service type name (required)
- `expiryDate`: Expiry date in dd/MM/yyyy format (required)
- `daysRemaining`: Days until expiry (required, except for EXPIRED stage)

### 3. Block Template Send if Required Variables Missing

**Validation System**:
- `validateTemplateVariables()` checks all required variables are present and non-empty
- Engine automatically skips candidates with missing variables
- Dry run shows specific missing variables in `reasonIfSkipped`

**Validation Flow**:
1. Get template mapping for renewal type + stage
2. Prepare variables from lead data
3. Validate against required variables
4. Block send if any required variable is missing
5. Include missing variable names in skip reason

### 4. Enhanced Dry Run Response

**Dry Run Response Structure**:
```typescript
{
  ok: true,
  candidates: [{
    renewalItemId: number,
    lead: {
      id: number,
      name: string,
      phone: string,
    },
    renewalType: string,      // NEW
    stage: string,
    template: string | null,   // NEW
    channel: string,           // NEW
    estimatedValue: number | null,  // NEW
    expiresAt: string,
    daysRemaining: number,
    variables: Record<string, string>,
    willSend: boolean,
    reasonIfSkipped?: string,
  }],
  totals: {
    sendCount: number,
    skipCount: number,
    failedCount: number,
  },
  errors: string[],
}
```

**New Fields in Dry Run**:
- `lead`: Object with id, name, phone (previously separate fields)
- `renewalType`: Type of renewal (TRADE_LICENSE, etc.)
- `template`: Template name that would be used
- `channel`: Communication channel (whatsapp, email, sms)
- `estimatedValue`: Expected revenue in AED

### 5. Meta Template Fetching Uses Integration Credentials

**Already Implemented**: The `/api/whatsapp/templates` route uses `getWhatsAppCredentials()` which:
- **DB-first**: Reads from Integration table first
- **Falls back to env**: Only uses environment variables if DB config not available
- **WABA ID**: Automatically fetches WABA ID from phone number if not configured
- **PostgreSQL Compatible**: All queries use Prisma ORM (PostgreSQL native)

**Template Fetching** (`src/lib/renewals/templates.ts`):
- `fetchMetaTemplates()`: Uses `getWhatsAppCredentials()` for DB-first credentials
- `verifyTemplateExists()`: Validates template exists in Meta before sending

## Database Compatibility

**PostgreSQL Native**:
- All Prisma queries use PostgreSQL-compatible syntax
- JSON fields use `JSONB` type (PostgreSQL-specific)
- Indexes use PostgreSQL-native syntax
- No SQLite-specific features used

**Schema Compatibility**:
- Template mappings stored in `Integration.config` (JSONB field)
- No new database tables required (uses existing Integration model)
- All queries work with PostgreSQL indexes

## API Changes

### Enhanced Dry Run
- **Route**: `POST /api/renewals/engine/dry-run`
- **Response**: Now includes `lead`, `renewalType`, `template`, `channel`, `estimatedValue` fields

### Template System
- **New Module**: `src/lib/renewals/templates.ts`
- **Functions**:
  - `getTemplateMapping()`: Get mapping for renewal type + stage
  - `validateTemplateVariables()`: Validate variables against requirements
  - `getTemplateMappingsForType()`: Get all mappings for a renewal type
  - `fetchMetaTemplates()`: Fetch templates from Meta (DB-first credentials)
  - `verifyTemplateExists()`: Verify template exists before sending

## Configuration

### Integration Config Structure

To override default template mappings, add to Integration config (JSON):

```json
{
  "renewalTemplateMappings": [
    {
      "renewalType": "TRADE_LICENSE",
      "stage": "T-30",
      "templateName": "custom_tl_30",
      "channel": "whatsapp",
      "requiredVariables": [
        { "name": "name", "required": true },
        { "name": "service", "required": true },
        { "name": "expiryDate", "required": true },
        { "name": "daysRemaining", "required": true }
      ]
    }
  ]
}
```

## Error Handling

**Template Validation Errors**:
- Missing template mapping → `reasonIfSkipped: "No template mapping for {type} / {stage}"`
- Missing variables → `reasonIfSkipped: "Missing required template variables: {var1}, {var2}"`

**Meta Template Fetching Errors**:
- Missing credentials → Error response with hint
- Invalid WABA ID → Detailed error with suggestion
- Network errors → Caught and logged

## Testing

### Test Dry Run
```bash
POST /api/renewals/engine/dry-run
{
  "windowDays": 30,
  "serviceTypes": ["TRADE_LICENSE"],
  "onlyNotContacted": true
}
```

### Verify Template Mapping
- Check Integration config for `renewalTemplateMappings`
- Verify Meta templates exist via `/api/whatsapp/templates`
- Run dry run to see template assignments

## Files Created/Modified

### New Files
- `src/lib/renewals/templates.ts`: Template management and validation

### Modified Files
- `src/lib/renewals/engine.ts`: Updated to use new template system with validation
- `src/app/api/renewals/engine/dry-run/route.ts`: Enhanced response with additional fields
- `src/app/api/whatsapp/templates/route.ts`: Already uses DB-first credentials (verified)

## Next Steps

1. Configure template mappings in Integration settings
2. Verify all Meta templates exist and are approved
3. Test dry run to see template assignments
4. Run engine to send actual messages


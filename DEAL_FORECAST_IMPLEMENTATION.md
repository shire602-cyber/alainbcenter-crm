# Deal Probability & Revenue Forecasting - Implementation Summary

## ✅ Completed

### 1. Database Schema
- ✅ Added forecast fields to `Lead` model:
  - `dealProbability` (Int, 0-100)
  - `expectedRevenueAED` (Int, nullable)
  - `forecastReasonJson` (String, JSON array)
  - `serviceFeeAED` (Int, optional staff override)
  - `stageProbabilityOverride` (Int, optional manual override)
  - `forecastModelVersion` (String)
  - `forecastLastComputedAt` (DateTime)
- ✅ Created `ServicePricing` model for admin-editable pricing
- ✅ Migration file created: `20250127181000_add_deal_forecast`

### 2. Forecast Engine
- ✅ Created `/src/lib/forecast/dealForecast.ts`
- ✅ Deterministic scoring model (version: `forecast_v1`)
- ✅ Stage-based probability with modifiers
- ✅ Expected revenue calculation
- ✅ Explainable reasons (top 6 factors)

### 3. Recompute Hooks
- ✅ Inbound message: `autoMatchPipeline.ts`
- ✅ Outbound message: `messages/send/route.ts`
- ✅ Stage change: `leads/[id]/route.ts` (PATCH)
- ✅ Quotation sent: `automation/infoShared.ts`
- ✅ Document upload: `documents/upload/route.ts`

### 4. UI Components
- ✅ `ForecastCard` component created
- ✅ `Progress` component created
- ✅ Integrated into `LeadDetailPagePremium.tsx`
- ✅ API endpoint: `/api/leads/[id]/forecast/recompute`

## ⏳ Pending

### 5. Lead List Display
- [ ] Add probability pill to `LeadCard.tsx`
- [ ] Add expected revenue display
- [ ] Update lead list API to include forecast fields

### 6. Dashboard Widgets
- [ ] Total expected revenue widget
- [ ] Pipeline by stage totals (expected revenue)
- [ ] "At Risk" list (high value, low activity)
- [ ] Forecast trends chart

### 7. Daily Cron Job
- [ ] Create `/api/cron/recompute-forecasts/route.ts`
- [ ] Recompute all active leads daily
- [ ] Apply aging penalties

### 8. Service Pricing Seed Data
- [ ] Create seed script for common services
- [ ] Admin UI for editing pricing

### 9. Tests
- [ ] Unit tests: `dealForecast.ts`
- [ ] Integration tests: stage changes, quote sent, etc.
- [ ] Test expected revenue calculation

## Forecast Model Rules

### Base Probabilities by Stage
- NEW: 20%
- CONTACTED: 30%
- ENGAGED: 35%
- QUALIFIED: 45%
- PROPOSAL_SENT: 55%
- IN_PROGRESS: 65%
- COMPLETED_WON: 100%
- LOST: 0%
- ON_HOLD: 10%

### Positive Modifiers
- +10: Customer replied within last 48h
- +10: Quote sent AND customer responded
- +8: Phone + email present
- +6: Service details complete + documents
- +6: AI score HOT (>=70)
- +5: Timeline: ASAP
- +3: Timeline: this week
- +3: AI score WARM (50-69)

### Negative Modifiers
- -10: No outbound reply within 24h of inbound
- -10: 2+ follow-ups with no reply
- -15: Lead aged >14 days in New/Contacted

### Expected Revenue
- If `serviceFeeAED` set → use it
- Else use `ServicePricing.defaultFeeAED`
- Formula: `round(defaultFeeAED * probability / 100)`
- If service unknown → null

## Usage

### Manual Recompute
```typescript
import { recomputeAndSaveForecast } from '@/lib/forecast/dealForecast'
const forecast = await recomputeAndSaveForecast(leadId)
```

### API Endpoint
```bash
POST /api/leads/[id]/forecast/recompute
```

### Display in UI
```tsx
<ForecastCard
  leadId={lead.id}
  dealProbability={lead.dealProbability}
  expectedRevenueAED={lead.expectedRevenueAED}
  forecastReasonJson={lead.forecastReasonJson}
/>
```

## Next Steps

1. Add forecast to lead list cards
2. Create dashboard widgets
3. Add daily cron for recomputation
4. Seed service pricing data
5. Write comprehensive tests


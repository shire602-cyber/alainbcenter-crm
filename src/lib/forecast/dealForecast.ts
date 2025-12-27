/**
 * Deterministic Deal Probability & Revenue Forecasting Engine
 * 
 * Version: forecast_v1
 * 
 * Principles:
 * - Base score on deterministic signals (behavior + completeness)
 * - LLM is optional and only for summary notes, never for numbers
 * - Every probability must show "why" (top factors)
 */

import { prisma } from '../prisma'

export interface ForecastInput {
  leadId: number
  stage: string
  lastInboundAt: Date | null
  lastOutboundAt: Date | null
  hasPhone: boolean
  hasEmail: boolean
  serviceKey: string | null
  hasQuoteSent: boolean
  followUpCount: number
  customerRepliedAfterFollowUp: boolean
  hasDocsUploadedCount: number
  expiryExists: boolean
  aiScore: number | null
  startTimeline: 'ASAP' | 'this week' | 'this month' | 'later' | null
  serviceFeeAED?: number | null // Staff-entered override
  stageProbabilityOverride?: number | null // Manual override
  quotationSentAt: Date | null
  customerRepliedAfterQuote: boolean
  leadAgeDays: number
}

export interface ForecastOutput {
  probability: number // 0-100
  expectedRevenueAED: number | null
  reasons: string[]
  modelVersion: string
}

/**
 * Stage base probabilities
 */
const STAGE_BASE_PROBABILITIES: Record<string, number> = {
  'NEW': 20,
  'CONTACTED': 30,
  'ENGAGED': 35,
  'QUALIFIED': 45,
  'PROPOSAL_SENT': 55,
  'IN_PROGRESS': 65,
  'COMPLETED_WON': 100,
  'LOST': 0,
  'ON_HOLD': 10,
}

/**
 * Compute deal probability and expected revenue
 */
export async function computeDealForecast(input: ForecastInput): Promise<ForecastOutput> {
  const reasons: string[] = []
  
  // Start with stage base probability
  let probability = STAGE_BASE_PROBABILITIES[input.stage] || 20
  const stageBase = probability
  reasons.push(`Stage=${input.stage} (${stageBase} base)`)

  // Apply manual override if set
  if (input.stageProbabilityOverride !== null && input.stageProbabilityOverride !== undefined) {
    probability = input.stageProbabilityOverride
    reasons.push(`Manual override: ${input.stageProbabilityOverride}`)
    return {
      probability: Math.max(0, Math.min(100, probability)),
      expectedRevenueAED: await computeExpectedRevenue(input, probability),
      reasons,
      modelVersion: 'forecast_v1',
    }
  }

  // Positive factors
  // +10 if customer replied within last 48h
  const now = new Date()
  const hoursSinceLastInbound = input.lastInboundAt
    ? (now.getTime() - input.lastInboundAt.getTime()) / (1000 * 60 * 60)
    : Infinity
  
  if (hoursSinceLastInbound <= 48) {
    probability += 10
    reasons.push(`Customer replied in last 48h (+10)`)
  }

  // +10 if quote sent AND customer responded after quote
  if (input.hasQuoteSent && input.customerRepliedAfterQuote) {
    probability += 10
    reasons.push(`Quote sent and customer responded (+10)`)
  } else if (input.hasQuoteSent && !input.customerRepliedAfterQuote) {
    // Quote sent but no response - neutral (don't penalize, but don't reward)
    reasons.push(`Quote sent but no response yet (0)`)
  }

  // +8 if phone+email present
  if (input.hasPhone && input.hasEmail) {
    probability += 8
    reasons.push(`Phone and email present (+8)`)
  } else if (input.hasPhone || input.hasEmail) {
    probability += 4
    reasons.push(`${input.hasPhone ? 'Phone' : 'Email'} present (+4)`)
  }

  // +6 if service fields complete (business setup: activity+jurisdiction+partners+visas)
  // This is service-specific, simplified for now
  if (input.serviceKey && input.hasDocsUploadedCount > 0) {
    probability += 6
    reasons.push(`Service details and documents complete (+6)`)
  }

  // +6 if AI score HOT (>=70)
  if (input.aiScore !== null && input.aiScore >= 70) {
    probability += 6
    reasons.push(`AI score HOT (${input.aiScore}) (+6)`)
  } else if (input.aiScore !== null && input.aiScore >= 50) {
    probability += 3
    reasons.push(`AI score WARM (${input.aiScore}) (+3)`)
  }

  // Timeline urgency bonus
  if (input.startTimeline === 'ASAP') {
    probability += 5
    reasons.push(`Timeline: ASAP (+5)`)
  } else if (input.startTimeline === 'this week') {
    probability += 3
    reasons.push(`Timeline: this week (+3)`)
  }

  // Negative factors
  // -10 if no outbound reply within 24h of inbound
  if (input.lastInboundAt && input.lastOutboundAt) {
    const hoursSinceInbound = (input.lastOutboundAt.getTime() - input.lastInboundAt.getTime()) / (1000 * 60 * 60)
    if (hoursSinceInbound > 24) {
      probability -= 10
      reasons.push(`No outbound reply within 24h of inbound (-10)`)
    }
  } else if (input.lastInboundAt && !input.lastOutboundAt) {
    const hoursSinceInbound = (now.getTime() - input.lastInboundAt.getTime()) / (1000 * 60 * 60)
    if (hoursSinceInbound > 24) {
      probability -= 10
      reasons.push(`No outbound reply within 24h of inbound (-10)`)
    }
  }

  // -10 if 2+ follow-ups with no reply
  if (input.followUpCount >= 2 && !input.customerRepliedAfterFollowUp) {
    probability -= 10
    reasons.push(`${input.followUpCount} follow-ups with no reply (-10)`)
  }

  // -15 if lead is older than 14 days in New/Contacted
  if ((input.stage === 'NEW' || input.stage === 'CONTACTED') && input.leadAgeDays > 14) {
    probability -= 15
    reasons.push(`Lead aged ${input.leadAgeDays} days in ${input.stage} (-15)`)
  }

  // Cap probability between 0 and 100
  probability = Math.max(0, Math.min(100, probability))

  // Compute expected revenue
  const expectedRevenueAED = await computeExpectedRevenue(input, probability)

  return {
    probability: Math.round(probability),
    expectedRevenueAED,
    reasons: reasons.slice(0, 6), // Top 6 reasons
    modelVersion: 'forecast_v1',
  }
}

/**
 * Compute expected revenue in AED
 */
async function computeExpectedRevenue(
  input: ForecastInput,
  probability: number
): Promise<number | null> {
  // If staff entered service fee, use it
  if (input.serviceFeeAED !== null && input.serviceFeeAED !== undefined && input.serviceFeeAED > 0) {
    return Math.round(input.serviceFeeAED * (probability / 100))
  }

  // If service unknown, return null
  if (!input.serviceKey) {
    return null
  }

  // Get default fee from ServicePricing
  try {
    const pricing = await prisma.servicePricing.findUnique({
      where: { serviceKey: input.serviceKey },
    })

    if (pricing) {
      // Expected revenue = default fee * probability / 100
      return Math.round(pricing.defaultFeeAED * (probability / 100))
    }
  } catch (error) {
    console.warn(`⚠️ [FORECAST] Failed to fetch pricing for ${input.serviceKey}:`, error)
  }

  // No pricing found - return null
  return null
}

/**
 * Build forecast input from lead data
 */
export async function buildForecastInput(leadId: number): Promise<ForecastInput> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      tasks: {
        where: {
          type: 'FOLLOW_UP',
        },
      },
      documents: true,
      expiryItems: {
        where: {
          expiryDate: {
            gte: new Date(),
          },
        },
        take: 1,
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
    },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Calculate follow-up count (tasks with FOLLOW_UP type)
  const followUpCount = lead.tasks.filter(t => t.type === 'FOLLOW_UP').length

  // Check if customer replied after follow-up
  // Simplified: check if there's an inbound message after the last follow-up task
  const lastFollowUpTask = lead.tasks
    .filter(t => t.type === 'FOLLOW_UP')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  
  const customerRepliedAfterFollowUp = lastFollowUpTask
    ? lead.messages.some(m => {
        const isInbound = m.direction === 'INBOUND' || m.direction === 'IN'
        const isAfterFollowUp = new Date(m.createdAt) > new Date(lastFollowUpTask.createdAt)
        return isInbound && isAfterFollowUp
      })
    : false

  // Check if customer replied after quote
  const customerRepliedAfterQuote = lead.quotationSentAt
    ? lead.messages.some(m => {
        const isInbound = m.direction === 'INBOUND' || m.direction === 'IN'
        const isAfterQuote = new Date(m.createdAt) > new Date(lead.quotationSentAt!)
        return isInbound && isAfterQuote
      })
    : false

  // Extract start timeline from dataJson
  let startTimeline: 'ASAP' | 'this week' | 'this month' | 'later' | null = null
  if (lead.dataJson) {
    try {
      const data = JSON.parse(lead.dataJson)
      if (data.goldenVisa?.startTimeline) {
        startTimeline = data.goldenVisa.startTimeline
      } else if (data.startTimeline) {
        startTimeline = data.startTimeline
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Calculate lead age in days
  const leadAgeDays = Math.floor(
    (new Date().getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Check SLA compliance (replied within 10 minutes)
  // This would require checking if there's an outbound message within 10 min of last inbound
  // Simplified for now - we'll use lastOutboundAt vs lastInboundAt

  return {
    leadId: lead.id,
    stage: lead.stage,
    lastInboundAt: lead.lastInboundAt,
    lastOutboundAt: lead.lastOutboundAt,
    hasPhone: !!lead.contact.phone,
    hasEmail: !!lead.contact.email,
    serviceKey: lead.serviceTypeEnum || null,
    hasQuoteSent: !!lead.quotationSentAt,
    followUpCount,
    customerRepliedAfterFollowUp,
    hasDocsUploadedCount: lead.documents.length,
    expiryExists: lead.expiryItems.length > 0,
    aiScore: lead.aiScore,
    startTimeline,
    serviceFeeAED: lead.serviceFeeAED,
    stageProbabilityOverride: lead.stageProbabilityOverride,
    quotationSentAt: lead.quotationSentAt,
    customerRepliedAfterQuote,
    leadAgeDays,
  }
}

/**
 * Recompute and save forecast for a lead
 */
export async function recomputeAndSaveForecast(leadId: number): Promise<ForecastOutput> {
  const input = await buildForecastInput(leadId)
  const forecast = await computeDealForecast(input)

  // Save to database
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      dealProbability: forecast.probability,
      expectedRevenueAED: forecast.expectedRevenueAED,
      forecastReasonJson: JSON.stringify(forecast.reasons),
      forecastModelVersion: forecast.modelVersion,
      forecastLastComputedAt: new Date(),
    },
  })

  console.log(`✅ [FORECAST] Updated lead ${leadId}: ${forecast.probability}% probability, ${forecast.expectedRevenueAED || 'N/A'} AED expected`)

  return forecast
}


/**
 * Renewal Follow-up Engine
 * Handles automated renewal reminders with guardrails
 */

import { prisma } from '@/lib/prisma'
import { differenceInDays, format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

// Default template mapping (can be overridden via config)
const DEFAULT_TEMPLATE_MAPPING: Record<string, Record<string, string>> = {
  TRADE_LICENSE: {
    'T-30': 'tl_30',
    'T-14': 'tl_14',
    'T-7': 'tl_7',
    'EXPIRED': 'tl_expired',
  },
  EMIRATES_ID: {
    'T-30': 'eid_30',
    'T-14': 'eid_14',
    'T-7': 'eid_7',
    'EXPIRED': 'eid_expired',
  },
  RESIDENCY: {
    'T-30': 'res_30',
    'T-14': 'res_14',
    'T-7': 'res_7',
    'EXPIRED': 'res_expired',
  },
  VISIT_VISA: {
    'T-30': 'vv_30',
    'T-14': 'vv_14',
    'T-7': 'vv_7',
    'EXPIRED': 'vv_expired',
  },
  CHANGE_STATUS: {
    'T-30': 'cs_30',
    'T-14': 'cs_14',
    'T-7': 'cs_7',
    'EXPIRED': 'cs_expired',
  },
}

// Business hours: 9am-9pm in Asia/Dubai
const QUIET_HOURS_START = 9 // 9am
const QUIET_HOURS_END = 21 // 9pm
const TIMEZONE = 'Asia/Dubai'
const RATE_LIMIT_HOURS = 24 // Don't send more than 1 message per lead per 24 hours

export type EngineCandidate = {
  renewalItemId: number
  leadId: number
  leadName: string
  phone: string
  serviceType: string
  stage: string
  templateName: string | null
  variables: Record<string, string>
  willSend: boolean
  reasonIfSkipped?: string
  expiresAt: Date
  daysRemaining: number
}

export type EngineResult = {
  candidates: EngineCandidate[]
  totals: {
    sendCount: number
    skipCount: number
    failedCount: number
  }
  errors: string[]
}

export type EngineConfig = {
  windowDays: number
  serviceTypes?: string[]
  assignedToUserId?: number
  onlyNotContacted?: boolean
  dryRun: boolean
}

/**
 * Get template mapping from Integration config or use defaults
 */
async function getTemplateMapping(): Promise<Record<string, Record<string, string>>> {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        OR: [
          { name: 'whatsapp' },
          { provider: 'whatsapp' },
        ],
        isEnabled: true,
      },
      select: { config: true },
    })

    if (integration?.config) {
      const config = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config

      if (config.renewalTemplateMapping) {
        return config.renewalTemplateMapping
      }
    }
  } catch (error) {
    console.warn('[RENEWAL-ENGINE] Failed to load template mapping from config, using defaults')
  }

  return DEFAULT_TEMPLATE_MAPPING
}

/**
 * Check if current time is within business hours (9am-9pm local time)
 */
export function isWithinBusinessHours(now: Date = new Date()): boolean {
  const zonedTime = toZonedTime(now, TIMEZONE)
  const hour = zonedTime.getHours()
  return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END
}

/**
 * Determine renewal stage based on days remaining
 */
function getRenewalStage(daysRemaining: number): string | null {
  if (daysRemaining < 0) return 'EXPIRED'
  if (daysRemaining === 30) return 'T-30'
  if (daysRemaining === 14) return 'T-14'
  if (daysRemaining === 7) return 'T-7'
  // Only send on exact days, not ranges
  return null
}

/**
 * Prepare template variables for a renewal item
 */
function prepareTemplateVariables(
  leadName: string,
  serviceName: string | null,
  expiresAt: Date,
  daysRemaining: number
): Record<string, string> {
  return {
    name: leadName || 'Customer',
    service: serviceName || 'service',
    expiryDate: format(expiresAt, 'dd/MM/yyyy'),
    daysRemaining: Math.abs(daysRemaining).toString(),
  }
}

/**
 * Main engine function
 */
export async function runRenewalEngine(config: EngineConfig): Promise<EngineResult> {
  const now = new Date()
  const candidates: EngineCandidate[] = []
  const errors: string[] = []
  
  // Get template mapping
  const templateMapping = await getTemplateMapping()

  // Build query filters
  const whereClause: any = {
    status: {
      notIn: ['RENEWED', 'LOST'],
    },
  }

  // Window filter: items expiring within windowDays
  const windowEnd = new Date(now)
  windowEnd.setDate(windowEnd.getDate() + config.windowDays)
  
  whereClause.expiresAt = {
    lte: windowEnd,
    gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // Also include items expired up to 30 days ago
  }

  if (config.serviceTypes && config.serviceTypes.length > 0) {
    whereClause.serviceType = { in: config.serviceTypes }
  }

  if (config.assignedToUserId) {
    whereClause.assignedToUserId = config.assignedToUserId
  }

  if (config.onlyNotContacted) {
    whereClause.lastContactedAt = null
  }

  // Fetch renewal items
  const renewalItems = await prisma.renewalItem.findMany({
    where: whereClause,
    include: {
      lead: {
        include: {
          contact: {
            select: {
              fullName: true,
              phone: true,
            },
          },
        },
      },
    },
    orderBy: {
      expiresAt: 'asc',
    },
  })

  // Process each item
  for (const item of renewalItems) {
    try {
      const daysRemaining = differenceInDays(item.expiresAt, now)
      const stage = getRenewalStage(daysRemaining)

      // Skip if no stage (not an exact reminder day)
      if (!stage) {
        continue
      }

      const leadName = item.lead?.contact?.fullName || 'Customer'
      const phone = item.lead?.contact?.phone || ''
      const serviceType = item.serviceType
      const serviceName = item.serviceName || serviceType.replace('_', ' ')

      // Get template name
      const templateName = templateMapping[serviceType]?.[stage] || null

      // Prepare variables
      const variables = prepareTemplateVariables(
        leadName,
        serviceName,
        item.expiresAt,
        daysRemaining
      )

      // Check guardrails
      let willSend = true
      let reasonIfSkipped: string | undefined

      // Guardrail 1: Missing template
      if (!templateName) {
        willSend = false
        reasonIfSkipped = `No template mapping for ${serviceType} / ${stage}`
      }

      // Guardrail 2: Missing required variables
      if (willSend && (!variables.name || !variables.service || !variables.expiryDate)) {
        willSend = false
        reasonIfSkipped = 'Missing required template variables'
      }

      // Guardrail 3: Rate limit (24 hours)
      if (willSend && item.lastContactedAt) {
        const hoursSinceLastContact = (now.getTime() - item.lastContactedAt.getTime()) / (1000 * 60 * 60)
        if (hoursSinceLastContact < RATE_LIMIT_HOURS) {
          willSend = false
          reasonIfSkipped = `Contacted ${Math.round(hoursSinceLastContact)}h ago (rate limit: ${RATE_LIMIT_HOURS}h)`
        }
      }

      // Guardrail 4: Quiet hours (only in dry run, actual run checks later)
      if (willSend && config.dryRun && !isWithinBusinessHours(now)) {
        willSend = false
        reasonIfSkipped = 'Outside business hours (9am-9pm)'
      }

      // Guardrail 5: Missing phone
      if (willSend && !phone) {
        willSend = false
        reasonIfSkipped = 'No phone number for lead'
      }

      candidates.push({
        renewalItemId: item.id,
        leadId: item.leadId,
        leadName,
        phone,
        serviceType,
        stage,
        templateName,
        variables,
        willSend,
        reasonIfSkipped,
        expiresAt: item.expiresAt,
        daysRemaining,
      })
    } catch (error: any) {
      errors.push(`Error processing renewal item ${item.id}: ${error.message}`)
    }
  }

  const sendCount = candidates.filter(c => c.willSend).length
  const skipCount = candidates.filter(c => !c.willSend).length

  return {
    candidates,
    totals: {
      sendCount,
      skipCount,
      failedCount: 0, // Will be updated in actual run
    },
    errors,
  }
}

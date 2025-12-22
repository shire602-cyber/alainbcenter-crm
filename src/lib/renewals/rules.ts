import { prisma } from '@/lib/prisma'

export type RenewalStage = '90D' | '60D' | '30D' | '7D' | 'EXPIRED' | null

export interface ExpiryItemWithLogs {
  id: number
  type: string
  expiryDate: Date
  renewalStatus: string
  lastReminderSentAt: Date | null
  reminderCount: number
  leadId: number | null
  contactId: number
}

/**
 * Get renewal stage based on expiry date and reminder history
 * Uses Asia/Dubai timezone for date calculations
 */
export async function getRenewalStage(
  expiryItem: ExpiryItemWithLogs,
  now: Date = new Date()
): Promise<RenewalStage> {
  // Only process PENDING renewals
  if (expiryItem.renewalStatus !== 'PENDING') {
    return null
  }

  // Calculate days until expiry
  // Note: Dates are stored in UTC, we calculate difference directly
  const expiryDate = new Date(expiryItem.expiryDate)
  const daysUntilExpiry = Math.floor(
    (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  // Don't process if expiry is more than 120 days away
  if (daysUntilExpiry > 120) {
    return null
  }

  // Don't process if expired more than 60 days ago
  if (daysUntilExpiry < -60) {
    return null
  }

  // Check if we've already sent a reminder recently
  const lastReminderDate = expiryItem.lastReminderSentAt
    ? new Date(expiryItem.lastReminderSentAt)
    : null

  // Don't send more than one reminder per 24 hours
  if (lastReminderDate) {
    const hoursSinceLastReminder = (now.getTime() - lastReminderDate.getTime()) / (1000 * 60 * 60)
    if (hoursSinceLastReminder < 24) {
      return null
    }
  }

  // Determine stage based on days until expiry
  let stage: RenewalStage = null

  if (daysUntilExpiry < 0) {
    stage = 'EXPIRED'
  } else if (daysUntilExpiry <= 7) {
    stage = '7D'
  } else if (daysUntilExpiry <= 30) {
    stage = '30D'
  } else if (daysUntilExpiry <= 60) {
    stage = '60D'
  } else if (daysUntilExpiry <= 90) {
    stage = '90D'
  }

  if (!stage) {
    return null
  }

  // Check if we've already processed this stage (via AutomationRunLog)
  const idempotencyKey = `renewal:${expiryItem.id}:${stage}`
  const existingLog = await prisma.automationRunLog.findUnique({
    where: { idempotencyKey },
  })

  if (existingLog) {
    return null // Already processed this stage
  }

  return stage
}

/**
 * Get all eligible expiry items for renewal processing
 */
export async function getEligibleExpiryItems() {
  const now = new Date()
  
  // Calculate date range: 120 days in future to 60 days in past
  const futureDate = new Date(now)
  futureDate.setDate(futureDate.getDate() + 120)
  
  const pastDate = new Date(now)
  pastDate.setDate(pastDate.getDate() - 60)

  return await prisma.expiryItem.findMany({
    where: {
      renewalStatus: 'PENDING',
      expiryDate: {
        gte: pastDate,
        lte: futureDate,
      },
    },
    include: {
      lead: {
        include: {
          contact: true,
          assignedUser: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      contact: true,
      assignedUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: {
      expiryDate: 'asc',
    },
  })
}

















/**
 * Renewal Pipeline Stats Helper
 * 
 * Provides aggregated metrics for renewal dashboard
 */

import { prisma } from '../prisma'
import { differenceInDays } from 'date-fns'

export interface RenewalPipelineStats {
  expiring90Days: number
  expiring30Days: number
  expiredNotRenewed: number
  projectedRevenue: number // Sum of estimatedRenewalValue * (renewalProbability / 100) for next 90 days
  renewalConversionRate: number
}

/**
 * Get renewal pipeline statistics
 */
export async function getRenewalPipelineStats(): Promise<RenewalPipelineStats> {
  const now = new Date()
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  // Fetch all expiry items with their leads
  const expiryItems = await prisma.expiryItem.findMany({
    include: {
      lead: {
        select: {
          id: true,
          estimatedRenewalValue: true,
          renewalProbability: true,
          stage: true,
        },
      },
    },
    where: {
      expiryDate: {
        lte: ninetyDaysFromNow,
      },
      renewalStatus: {
        not: 'NOT_RENEWING',
      },
    },
  })

  let expiring90Days = 0
  let expiring30Days = 0
  let expiredNotRenewed = 0
  let projectedRevenue = 0
  let renewed = 0
  let pending = 0

  expiryItems.forEach((item) => {
    const days = differenceInDays(item.expiryDate, now)
    
    if (days <= 90 && days > 0) {
      expiring90Days++
    }
    if (days <= 30 && days > 0) {
      expiring30Days++
    }
    if (days < 0 && item.renewalStatus !== 'RENEWED') {
      expiredNotRenewed++
    }
    if (item.renewalStatus === 'RENEWED') {
      renewed++
    }
    if (item.renewalStatus === 'PENDING') {
      pending++
    }

    // Calculate projected revenue
    if (item.lead && item.lead.estimatedRenewalValue && item.lead.renewalProbability) {
      const value = parseFloat(item.lead.estimatedRenewalValue) || 0
      const probability = item.lead.renewalProbability || 0
      projectedRevenue += (value * probability) / 100
    }
  })

  const total = renewed + pending
  const renewalConversionRate = total > 0 ? (renewed / total) * 100 : 0

  return {
    expiring90Days,
    expiring30Days,
    expiredNotRenewed,
    projectedRevenue: Math.round(projectedRevenue),
    renewalConversionRate,
  }
}








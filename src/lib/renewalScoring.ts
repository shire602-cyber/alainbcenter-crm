/**
 * Renewal Scoring Helper
 * 
 * Computes renewal probability (0-100) and provides human-readable reasons
 * This is a deterministic heuristic-based system (AI enhancement optional)
 */

import { prisma } from './prisma'

export type RenewalScoreResult = {
  probability: number // 0-100
  reasons: string[]
}

/**
 * Compute renewal score for a lead
 * 
 * Heuristics (baseline, no AI required):
 * - Base probability from stage (Won/Existing > Qualified > Engaged > New)
 * - Source (referral/returning vs cold)
 * - Recency & sentiment of messages
 * - Expiry window (15-90 days = optimal)
 * - aiScore (if high, boost probability)
 * - Previous renewal history
 * - Adjust down if overdue or negative sentiment
 */
export async function computeRenewalScore(
  lead: any & { 
    expiryItems?: any[]
    messages?: any[]
  }
): Promise<RenewalScoreResult> {
  const reasons: string[] = []
  let probability = 50 // Start at 50% baseline

  // Factor 1: Current stage (Won/Existing customer > Qualified > Engaged > New)
  const stageScores: Record<string, number> = {
    'COMPLETED_WON': 30,
    'WON': 30,
    'QUALIFIED': 20,
    'ENGAGED': 15,
    'CONTACTED': 10,
    'NEW': 5,
    'LOST': -20,
    'ON_HOLD': -10,
  }
  const stageScore = stageScores[lead.stage] || 0
  probability += stageScore
  if (stageScore > 0) {
    reasons.push(`High-quality lead (stage: ${lead.stage})`)
  } else if (stageScore < 0) {
    reasons.push(`Low probability due to stage: ${lead.stage}`)
  }

  // Factor 2: Source (referral/returning vs cold)
  if (lead.isRenewal || lead.originalExpiryItemId) {
    probability += 25
    reasons.push('Existing client (returning customer)')
  } else if (lead.source === 'referral' || lead.source?.includes('referral')) {
    probability += 15
    reasons.push('Referral source (higher trust)')
  } else if (lead.source === 'website' || lead.source === 'whatsapp') {
    probability += 5
    reasons.push('Direct inquiry (moderate interest)')
  }

  // Factor 3: Expiry proximity (15-90 days = optimal renewal window)
  const now = new Date()
  const nearestExpiry = lead.expiryItems?.[0]
  if (nearestExpiry) {
    const expiryDate = new Date(nearestExpiry.expiryDate)
    const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysUntil > 0 && daysUntil <= 90) {
      // Optimal window: 15-90 days
      if (daysUntil >= 15 && daysUntil <= 90) {
        probability += 20
        reasons.push(`Expiry in optimal renewal window (${daysUntil} days)`)
      } else if (daysUntil < 15) {
        probability += 15
        reasons.push(`Expiry approaching (${daysUntil} days) - urgent`)
      } else {
        probability += 5
        reasons.push(`Expiry coming up (${daysUntil} days)`)
      }
    } else if (daysUntil <= 0) {
      // Expired - high urgency but also risk
      const daysOverdue = Math.abs(daysUntil)
      if (daysOverdue <= 30) {
        probability += 10
        reasons.push(`Expired ${daysOverdue} days ago - urgent renewal needed`)
      } else {
        probability -= 10
        reasons.push(`Expired ${daysOverdue} days ago - risk of service interruption`)
      }
    } else {
      // Too far out (>90 days)
      probability -= 5
      reasons.push(`Expiry far in future (${daysUntil} days) - not urgent yet`)
    }

    // Renewal status
    if (nearestExpiry.renewalStatus === 'IN_PROGRESS') {
      probability += 30
      reasons.push('Renewal already in progress')
    } else if (nearestExpiry.renewalStatus === 'NOT_RENEWING') {
      probability = Math.min(probability, 20)
      reasons.push('Customer indicated not renewing')
    }
  } else {
    probability -= 10
    reasons.push('No tracked expiry items')
  }

  // Factor 4: Recent activity & sentiment
  const recentMessages = lead.messages?.filter(
    (m: any) => new Date(m.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ) || []

  if (recentMessages.length > 5) {
    probability += 15
    reasons.push('High recent engagement')
  } else if (recentMessages.length > 0) {
    probability += 5
    reasons.push('Some recent activity')
  } else {
    probability -= 10
    reasons.push('No recent communication')
  }

  // Check for negative sentiment keywords
  const negativeKeywords = ['cancel', 'refund', 'not renewing', 'switching', 'leaving', 'disappointed']
  const messageTexts = recentMessages.map((m: any) => (m.body || '').toLowerCase()).join(' ')
  const hasNegativeSentiment = negativeKeywords.some(keyword => messageTexts.includes(keyword))
  
  if (hasNegativeSentiment) {
    probability -= 20
    reasons.push('Negative sentiment detected in recent messages')
  }

  // Factor 5: AI Score (if high, boost probability)
  if (lead.aiScore && lead.aiScore >= 70) {
    probability += 10
    reasons.push('High AI qualification score')
  } else if (lead.aiScore && lead.aiScore < 40) {
    probability -= 10
    reasons.push('Low AI qualification score')
  }

  // Factor 6: Service type (business setup = higher value)
  const serviceType = lead.serviceTypeEnum || lead.leadType || ''
  if (serviceType.includes('BUSINESS_SETUP')) {
    probability += 10
    reasons.push('Business setup service (high renewal value)')
  } else if (serviceType.includes('VISA')) {
    probability += 5
    reasons.push('Visa service (regular renewal cycle)')
  }

  // Factor 7: Assigned agent (personal relationship)
  if (lead.assignedUserId) {
    probability += 5
    reasons.push('Assigned to dedicated agent')
  }

  // Clamp probability between 0-100
  probability = Math.max(0, Math.min(100, Math.round(probability)))

  return {
    probability,
    reasons: reasons.length > 0 ? reasons : ['Baseline probability'],
  }
}

/**
 * Recalculate and persist renewal score on a lead
 * 
 * Call this:
 * - After any expiry is created/updated for that lead
 * - After relevant automation/actions (e.g. when stage changes to WON)
 * - After strong renewal conversation
 * - Optionally in a daily cron for all leads with upcoming expiries
 */
export async function recalcLeadRenewalScore(leadId: number): Promise<void> {
  // Load lead with all necessary relations
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      expiryItems: {
        orderBy: { expiryDate: 'asc' },
        where: {
          renewalStatus: { not: 'NOT_RENEWING' },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Compute renewal score
  const score = await computeRenewalScore(lead)

  // Update lead with renewal score and notes
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      renewalProbability: score.probability,
      renewalNotes: score.reasons.join(' | '),
    },
  })

  console.log(`✅ Updated renewal score for lead ${leadId}: ${score.probability}%`)
}


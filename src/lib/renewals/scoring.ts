/**
 * AI-Powered Renewal Scoring System
 * 
 * Computes renewal probability and provides intelligent insights
 */

import { prisma } from '../prisma'
import { getAIConfig } from '../ai/client'

export interface RenewalScoreResult {
  probability: number // 0-100
  reasons: string[]
  projectedRevenue?: number
  riskFactors: string[]
  opportunities: string[]
}

/**
 * Compute renewal score for a lead
 */
export async function computeRenewalScore(
  leadId: number
): Promise<RenewalScoreResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
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
      tasks: {
        where: { status: 'OPEN' },
        take: 10,
      },
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  // Base score starts from AI lead score
  let baseScore = lead.aiScore || 50

  const reasons: string[] = []
  const riskFactors: string[] = []
  const opportunities: string[] = []

  // Factor 1: Expiry proximity (closer = higher probability)
  const now = new Date()
  const nearestExpiry = lead.expiryItems?.[0]
  if (nearestExpiry) {
    const daysUntil = Math.ceil(
      (new Date(nearestExpiry.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysUntil > 0 && daysUntil <= 90) {
      // Sweet spot: 30-90 days
      if (daysUntil >= 30 && daysUntil <= 90) {
        baseScore += 15
        reasons.push(`Expiry in optimal window (${daysUntil} days)`)
        opportunities.push('Renewal offer timing is perfect')
      } else if (daysUntil < 30) {
        baseScore += 10
        reasons.push(`Expiry approaching (${daysUntil} days)`)
      } else {
        baseScore += 5
        reasons.push(`Expiry coming up (${daysUntil} days)`)
      }
    } else if (daysUntil <= 0) {
      // Expired - urgency
      baseScore += 20
      reasons.push(`Expiry passed (${Math.abs(daysUntil)} days ago) - urgent renewal needed`)
      riskFactors.push('Expired - risk of service interruption')
    } else {
      // Too far out
      baseScore -= 5
      reasons.push(`Expiry far in future (${daysUntil} days)`)
    }
  } else {
    baseScore -= 10
    riskFactors.push('No tracked expiry items')
  }

  // Factor 2: Recent activity (more = higher probability)
  const recentMessages = lead.messages?.filter(
    (m) => new Date(m.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  ) || []

  if (recentMessages.length > 5) {
    baseScore += 15
    reasons.push('High recent engagement')
    opportunities.push('Active conversation - good time to discuss renewal')
  } else if (recentMessages.length > 0) {
    baseScore += 5
    reasons.push('Some recent activity')
  } else {
    baseScore -= 10
    riskFactors.push('No recent communication')
    opportunities.push('Re-engage to discuss renewal')
  }

  // Factor 3: Service type (business setup = higher value)
  const serviceType = lead.serviceTypeEnum || lead.leadType || ''
  if (serviceType.includes('BUSINESS_SETUP')) {
    baseScore += 10
    reasons.push('Business setup service (high renewal value)')
  } else if (serviceType.includes('VISA')) {
    baseScore += 5
    reasons.push('Visa service (regular renewal cycle)')
  }

  // Factor 4: Existing client (returning = higher probability)
  if (lead.isRenewal || lead.originalExpiryItemId) {
    baseScore += 20
    reasons.push('Existing client (returning customer)')
    opportunities.push('Loyal customer - prioritize renewal')
  }

  // Factor 5: Open tasks (engagement indicator)
  if (lead.tasks && lead.tasks.length > 0) {
    baseScore += 5
    reasons.push('Active tasks indicate engagement')
  }

  // Factor 6: Assigned agent (personal relationship)
  if (lead.assignedUserId) {
    baseScore += 5
    reasons.push('Assigned to dedicated agent')
    opportunities.push('Leverage agent relationship for renewal')
  }

  // Factor 7: Stage (qualified/won = higher probability)
  if (lead.stage === 'COMPLETED_WON' || lead.stage === 'QUALIFIED') {
    baseScore += 10
    reasons.push('High-quality lead (qualified/completed)')
  } else if (lead.stage === 'LOST') {
    baseScore = Math.min(baseScore, 30) // Cap at 30% if lost
    riskFactors.push('Lead previously lost')
  }

  // Factor 8: Renewal status
  if (nearestExpiry?.renewalStatus === 'IN_PROGRESS') {
    baseScore += 25
    reasons.push('Renewal already in progress')
    opportunities.push('Close renewal quickly - customer is ready')
  } else if (nearestExpiry?.renewalStatus === 'NOT_RENEWING') {
    baseScore = Math.min(baseScore, 20)
    riskFactors.push('Customer indicated not renewing')
  }

  // Clamp score between 0-100
  const probability = Math.max(0, Math.min(100, baseScore))

  // Try AI enhancement if available
  let aiInsights: string[] = []
  try {
    const aiConfig = await getAIConfig()
    if (aiConfig) {
      // Use AI to refine reasons
      aiInsights = await generateAIInsights(lead, probability, reasons, riskFactors, opportunities)
    }
  } catch (error) {
    // AI enhancement is optional - continue with heuristic
    console.warn('AI scoring enhancement failed:', error)
  }

  // Calculate projected revenue if we have estimated value
  let projectedRevenue: number | undefined
  if (nearestExpiry && lead.estimatedRenewalValue) {
    const value = parseFloat(lead.estimatedRenewalValue) || 0
    projectedRevenue = Math.round((value * probability) / 100)
  }

  return {
    probability,
    reasons: aiInsights.length > 0 ? aiInsights : reasons,
    projectedRevenue,
    riskFactors,
    opportunities,
  }
}

/**
 * Generate AI insights for renewal scoring
 */
async function generateAIInsights(
  lead: any,
  probability: number,
  reasons: string[],
  riskFactors: string[],
  opportunities: string[]
): Promise<string[]> {
  try {
    const aiConfig = await getAIConfig()
    if (!aiConfig) return reasons

    const prompt = `Analyze this UAE business center lead's renewal probability and provide 3-5 key insights.

Lead: ${lead.contact?.fullName || 'Unknown'}
Service: ${lead.serviceTypeEnum || lead.leadType || 'Unknown'}
AI Score: ${lead.aiScore || 'N/A'}
Current Renewal Probability: ${probability}%

Reasons: ${reasons.join(', ')}
Risk Factors: ${riskFactors.length > 0 ? riskFactors.join(', ') : 'None'}
Opportunities: ${opportunities.join(', ')}

Provide 3-5 concise, actionable insights in bullet point format. Focus on what makes this lead likely/unlikely to renew and specific actions to improve renewal chances.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a renewal intelligence assistant for a UAE business center. Provide concise, actionable insights.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })

    if (!response.ok) {
      return reasons // Fallback to heuristic
    }

    const data = await response.json()
    const insights = data.choices[0]?.message?.content || ''

    // Parse bullet points
    const parsedInsights = insights
      .split('\n')
      .map((line: string) => line.replace(/^[-*•]\s*/, '').trim())
      .filter((line: string) => line.length > 0)
      .slice(0, 5)

    return parsedInsights.length > 0 ? parsedInsights : reasons
  } catch (error) {
    console.error('AI insight generation failed:', error)
    return reasons
  }
}

/**
 * Update lead with renewal score
 */
export async function updateLeadRenewalScore(leadId: number): Promise<RenewalScoreResult> {
  const score = await computeRenewalScore(leadId)

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      renewalProbability: score.probability,
      renewalNotes: score.reasons.join(' | '),
      estimatedRenewalValue: score.projectedRevenue?.toString() || null,
    },
  })

  return score
}



















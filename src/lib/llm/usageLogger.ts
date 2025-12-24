/**
 * LLM Usage Logger
 * 
 * Logs token usage and costs for every LLM call
 */

import type { LLMUsageLog } from './types'
import { prisma } from '@/lib/prisma'

/**
 * Log LLM usage to database
 */
export async function logUsage(usage: LLMUsageLog): Promise<void> {
  try {
    // Try to log to database if table exists
    // For now, we'll use console and optionally create a table later
    console.log('📊 LLM Usage:', {
      provider: usage.provider,
      model: usage.model,
      tokens: `${usage.promptTokens} + ${usage.completionTokens} = ${usage.totalTokens}`,
      cost: `$${usage.cost.toFixed(4)}`,
      reason: usage.reason,
      complexity: usage.complexity,
      success: usage.success,
    })

    // TODO: Create LLMUsageLog table in Prisma schema if needed
    // For now, we'll use ExternalEventLog as a fallback
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'llm_usage',
          externalId: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          payload: JSON.stringify({
            provider: usage.provider,
            model: usage.model,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            cost: usage.cost,
            reason: usage.reason,
            complexity: usage.complexity,
            success: usage.success,
            error: usage.error,
            timestamp: usage.timestamp.toISOString(),
          }),
        },
      })
    } catch (dbError) {
      // Database logging failed, but continue
      console.warn('Failed to log LLM usage to database:', dbError)
    }
  } catch (error) {
    // Don't throw - logging is non-critical
    console.error('Failed to log LLM usage:', error)
  }
}

/**
 * Get usage statistics
 */
export async function getUsageStats(
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalCost: number
  totalTokens: number
  byProvider: Record<string, { cost: number; tokens: number }>
}> {
  try {
    const logs = await prisma.externalEventLog.findMany({
      where: {
        provider: 'llm_usage',
        ...(startDate || endDate
          ? {
              createdAt: {
                ...(startDate ? { gte: startDate } : {}),
                ...(endDate ? { lte: endDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    let totalCost = 0
    let totalTokens = 0
    const byProvider: Record<string, { cost: number; tokens: number }> = {}

    for (const log of logs) {
      try {
        const data = JSON.parse(log.payload || '{}')
        const cost = data.cost || 0
        const tokens = data.totalTokens || 0
        const provider = data.provider || 'unknown'

        totalCost += cost
        totalTokens += tokens

        if (!byProvider[provider]) {
          byProvider[provider] = { cost: 0, tokens: 0 }
        }
        byProvider[provider].cost += cost
        byProvider[provider].tokens += tokens
      } catch {
        // Skip invalid logs
      }
    }

    return {
      totalCost,
      totalTokens,
      byProvider,
    }
  } catch (error) {
    console.error('Failed to get usage stats:', error)
    return {
      totalCost: 0,
      totalTokens: 0,
      byProvider: {},
    }
  }
}


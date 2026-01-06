/**
 * Automatic Lead Scoring Triggers
 * 
 * Lightweight, fire-and-forget scoring triggers for real events
 * Uses deduplication to prevent spam
 */

import { prisma } from '@/lib/prisma'
import { scoreAndPersistLead } from './leadScoring'
import { upsertAiTaskForLead } from '@/lib/automation/nextBestAction'

// In-memory cache for deduplication (10 minute window)
// Key: leadId, Value: timestamp of last scoring attempt
const scoringCache = new Map<number, number>()
const DEDUPE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Check if we should score a lead now (deduplication)
 * Returns true if:
 * - Lead hasn't been scored in the last 10 minutes, OR
 * - No recent AI-suggested task exists (created in last 10 minutes)
 */
export async function shouldScoreLeadNow(leadId: number): Promise<boolean> {
  // Check in-memory cache first (fast path)
  const cachedTimestamp = scoringCache.get(leadId)
  const now = Date.now()
  
  if (cachedTimestamp && (now - cachedTimestamp) < DEDUPE_WINDOW_MS) {
    console.log(`[SCORE-TRIGGER] Skipping lead ${leadId} - scored ${Math.round((now - cachedTimestamp) / 1000)}s ago`)
    return false
  }

  // Check database for recent AI-suggested task (more reliable, survives restarts)
  try {
    const tenMinutesAgo = new Date(now - DEDUPE_WINDOW_MS)
    const recentTask = await prisma.task.findFirst({
      where: {
        leadId,
        aiSuggested: true,
        createdAt: {
          gte: tenMinutesAgo,
        },
      },
      select: {
        id: true,
        createdAt: true,
      },
    })

    if (recentTask) {
      const ageSeconds = Math.round((now - recentTask.createdAt.getTime()) / 1000)
      console.log(`[SCORE-TRIGGER] Skipping lead ${leadId} - AI task created ${ageSeconds}s ago (task ${recentTask.id})`)
      // Update cache
      scoringCache.set(leadId, recentTask.createdAt.getTime())
      return false
    }
  } catch (error: any) {
    // If DB check fails, fall back to cache-only (fail open)
    console.warn(`[SCORE-TRIGGER] DB check failed for lead ${leadId}, using cache:`, error.message)
  }

  // Should score - update cache
  scoringCache.set(leadId, now)
  return true
}

/**
 * Trigger lead scoring and NBA task generation (fire-and-forget)
 * Safe for Vercel - runs async, doesn't block request
 */
export async function triggerLeadScoring(
  leadId: number,
  trigger: 'inbound_message' | 'stage_change' | 'manual',
  conversationId?: number
): Promise<void> {
  // Check deduplication
  const shouldScore = await shouldScoreLeadNow(leadId)
  if (!shouldScore) {
    return
  }

  // Fire-and-forget - don't await, don't block
  // Use setTimeout to ensure it runs after response is sent
  setImmediate(async () => {
    try {
      console.log(`[SCORE-TRIGGER] Starting scoring for lead ${leadId} (trigger: ${trigger})`)
      
      // Score the lead
      const scoringResult = await scoreAndPersistLead(leadId, trigger)

      // Get conversationId if not provided
      let finalConversationId = conversationId
      if (!finalConversationId) {
        const conversation = await prisma.conversation.findFirst({
          where: { leadId },
          orderBy: { lastMessageAt: 'desc' },
          select: { id: true },
        })
        finalConversationId = conversation?.id
      }

      // Create/update NBA task
      await upsertAiTaskForLead({
        leadId,
        conversationId: finalConversationId,
        nba: scoringResult.nextBestAction,
      })

      console.log(`✅ [SCORE-TRIGGER] Completed scoring for lead ${leadId} (score: ${scoringResult.aiScore}, label: ${scoringResult.aiLabel})`)
    } catch (error: any) {
      // Silent fail - don't spam logs, but log for debugging
      console.error(`[SCORE-TRIGGER] Error scoring lead ${leadId}:`, error.message)
      // Remove from cache on error so it can retry
      scoringCache.delete(leadId)
    }
  })
}

/**
 * Clean up old cache entries (call periodically if needed)
 * For Vercel serverless, this isn't critical since instances are short-lived
 */
export function cleanupScoringCache(): void {
  const now = Date.now()
  const cutoff = now - DEDUPE_WINDOW_MS * 2 // Keep entries for 2x window
  
  for (const [leadId, timestamp] of scoringCache.entries()) {
    if (timestamp < cutoff) {
      scoringCache.delete(leadId)
    }
  }
}


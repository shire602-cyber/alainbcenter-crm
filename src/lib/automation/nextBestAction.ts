/**
 * Next Best Action Task Creation
 * 
 * Creates/updates AI-suggested tasks from Next Best Action recommendations
 * Uses idempotency to prevent duplicates
 */

import { prisma } from '@/lib/prisma'
import type { LeadScoringResult } from '@/lib/ai/leadScoring'

/**
 * Map NBA type to Task.type enum
 */
function mapNbaTypeToTaskType(nbaType: LeadScoringResult['nextBestAction']['type']): string {
  const mapping: Record<string, string> = {
    'REPLY_NOW': 'REPLY_WHATSAPP',
    'FOLLOW_UP': 'WHATSAPP',
    'SEND_TEMPLATE': 'WHATSAPP',
    'REQUEST_DOCS': 'DOCUMENT_REQUEST',
    'BOOK_CALL': 'CALL',
    'QUALIFY': 'CALL',
    'PROPOSAL': 'EMAIL',
  }
  return mapping[nbaType] || 'OTHER'
}

/**
 * Generate idempotency key for NBA task
 * Format: nba:{leadId}:{nbaType}:{YYYY-MM-DD} or nba:{leadId}:{conversationId}:{nbaType}:{YYYY-MM-DD}
 */
function generateIdempotencyKey(
  leadId: number,
  nbaType: string,
  conversationId?: number
): string {
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  if (conversationId) {
    return `nba:${leadId}:${conversationId}:${nbaType}:${today}`
  }
  return `nba:${leadId}:${nbaType}:${today}`
}

/**
 * Upsert AI-suggested task from Next Best Action
 * 
 * Rules:
 * 1. Creates task with idempotency key
 * 2. If task with same key exists and is OPEN, updates it (refresh)
 * 3. If lead is won/lost, skips task creation
 */
export async function upsertAiTaskForLead(options: {
  leadId: number
  conversationId?: number
  nba: LeadScoringResult['nextBestAction']
}): Promise<{ task: any; created: boolean } | null> {
  const { leadId, conversationId, nba } = options

  // Check if lead exists and get stage/status
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      stage: true,
      status: true,
      pipelineStage: true,
    },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Skip task creation if lead is won or lost
  const stage = lead.stage || lead.pipelineStage || ''
  const status = lead.status || ''
  const isWonOrLost = 
    stage === 'COMPLETED_WON' || 
    stage === 'LOST' || 
    status === 'won' || 
    status === 'lost'

  if (isWonOrLost) {
    console.log(`[NBA-TASK] Skipping task creation for lead ${leadId} - lead is ${stage || status}`)
    return null
  }

  // Generate idempotency key
  const idempotencyKey = generateIdempotencyKey(leadId, nba.type, conversationId)

  // Check if task with same key exists and is OPEN
  const existingTask = await prisma.task.findUnique({
    where: { idempotencyKey },
  })

  // Calculate due date
  const dueAt = new Date(Date.now() + nba.dueInMinutes * 60 * 1000)

  // Map NBA type to Task type
  const taskType = mapNbaTypeToTaskType(nba.type)

  if (existingTask) {
    // Task exists - check if it's OPEN
    if (existingTask.status === 'OPEN') {
      // Update existing task (refresh)
      const updated = await prisma.task.update({
        where: { id: existingTask.id },
        data: {
          title: nba.title,
          dueAt,
          updatedAt: new Date(),
        },
        include: {
          lead: {
            select: {
              id: true,
              stage: true,
            },
          },
          conversation: {
            select: {
              id: true,
            },
          },
        },
      })

      console.log(`[NBA-TASK] Updated existing task ${updated.id} for lead ${leadId} (NBA: ${nba.type})`)
      return { task: updated, created: false }
    } else {
      // Task exists but is DONE or SNOOZED - create new one with different key (add timestamp)
      const newKey = `${idempotencyKey}:${Date.now()}`
      const created = await prisma.task.create({
        data: {
          leadId,
          conversationId: conversationId || null,
          title: nba.title,
          type: taskType,
          dueAt,
          status: 'OPEN',
          aiSuggested: true,
          idempotencyKey: newKey,
        },
        include: {
          lead: {
            select: {
              id: true,
              stage: true,
            },
          },
          conversation: {
            select: {
              id: true,
            },
          },
        },
      })

      console.log(`[NBA-TASK] Created new task ${created.id} for lead ${leadId} (existing task was ${existingTask.status})`)
      return { task: created, created: true }
    }
  } else {
    // Task doesn't exist - create new one
    const created = await prisma.task.create({
      data: {
        leadId,
        conversationId: conversationId || null,
        title: nba.title,
        type: taskType,
        dueAt,
        status: 'OPEN',
        aiSuggested: true,
        idempotencyKey,
      },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
          },
        },
        conversation: {
          select: {
            id: true,
          },
        },
      },
    })

    console.log(`[NBA-TASK] Created new task ${created.id} for lead ${leadId} (NBA: ${nba.type})`)
    return { task: created, created: true }
  }
}


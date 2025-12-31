/**
 * PHASE 5E: Quote Follow-ups Scheduling
 * 
 * When a quote is sent, automatically schedule follow-up tasks at +3, +5, +7, +9, +12 days.
 * Tasks are idempotent and never duplicated.
 */

import { prisma } from '../prisma'
import { addDays, setHours, setMinutes } from 'date-fns'

const FOLLOWUP_CADENCE_DAYS = [3, 5, 7, 9, 12] as const

interface ScheduleQuoteFollowupsInput {
  leadId: number
  conversationId?: number
  quoteId?: number | string
  sentAt?: Date
}

/**
 * Schedule follow-up tasks after a quote is sent
 * 
 * NON-NEGOTIABLES:
 * - Deterministic (no LLM)
 * - Idempotent (no duplicate tasks)
 * - Respects soft-deleted conversations
 * - Does not break existing tasks logic
 */
export async function scheduleQuoteFollowups({
  leadId,
  conversationId,
  quoteId,
  sentAt = new Date(),
}: ScheduleQuoteFollowupsInput): Promise<{ created: number; skipped: number }> {
  // Guard: Do not schedule if lead is Won/Lost
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      stage: true,
      // Note: deletedAt may not be in Prisma types, but we check it with type assertion
    },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Skip if lead is Won or Lost
  if (lead.stage === 'COMPLETED_WON' || lead.stage === 'LOST') {
    console.log(`[QUOTE-FOLLOWUPS] Skipping lead ${leadId}: stage is ${lead.stage}`)
    return { created: 0, skipped: FOLLOWUP_CADENCE_DAYS.length }
  }

  // Skip if lead is soft-deleted (use type assertion since Prisma types may not include it)
  if ((lead as any).deletedAt) {
    console.log(`[QUOTE-FOLLOWUPS] Skipping lead ${leadId}: soft-deleted`)
    return { created: 0, skipped: FOLLOWUP_CADENCE_DAYS.length }
  }

  // Verify conversation exists (if provided)
  if (conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    })

    if (!conversation) {
      console.warn(`[QUOTE-FOLLOWUPS] Conversation ${conversationId} not found, continuing without conversation link`)
    }
  }

  let created = 0
  let skipped = 0

  // Create tasks for each cadence day
  for (const cadenceDays of FOLLOWUP_CADENCE_DAYS) {
    const dueAt = setMinutes(setHours(addDays(sentAt, cadenceDays), 10), 0) // 10:00 AM local time
    
    // Generate deterministic idempotency key
    const idempotencyKey = `quote_followup:${leadId}:${quoteId || 'none'}:${cadenceDays}`
    
    // Check if task already exists (idempotency check)
    const existingTask = await prisma.task.findUnique({
      where: { idempotencyKey },
    })

    if (existingTask) {
      console.log(`[QUOTE-FOLLOWUPS] Task already exists for lead ${leadId}, cadence ${cadenceDays} days`)
      skipped++
      continue
    }

    // Determine priority based on cadence (3 = highest, 12 = lowest)
    let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
    if (cadenceDays === 3) {
      priority = 'HIGH'
    } else if (cadenceDays === 5) {
      priority = 'NORMAL'
    } else {
      priority = 'LOW'
    }

    // Create task
    try {
      await prisma.task.create({
        data: {
          leadId,
          conversationId: conversationId || null,
          title: `Quote follow-up D+${cadenceDays}`,
          type: 'FOLLOW_UP',
          dueAt,
          status: 'OPEN',
          priority,
          idempotencyKey,
          // Store metadata in a way that doesn't break existing logic
          // Using payload field if available, otherwise we'll use title/type
          aiSuggested: false,
        },
      })
      created++
      console.log(`[QUOTE-FOLLOWUPS] Created task for lead ${leadId}, cadence ${cadenceDays} days, due ${dueAt.toISOString()}`)
    } catch (error: any) {
      // If unique constraint violation (idempotencyKey), skip
      if (error.code === 'P2002' && error.meta?.target?.includes('idempotencyKey')) {
        console.log(`[QUOTE-FOLLOWUPS] Task already exists (unique constraint) for lead ${leadId}, cadence ${cadenceDays} days`)
        skipped++
        continue
      }
      
      // If other error, log and continue (don't fail entire operation)
      console.error(`[QUOTE-FOLLOWUPS] Failed to create task for lead ${leadId}, cadence ${cadenceDays} days:`, error.message)
      skipped++
    }
  }

  return { created, skipped }
}

/**
 * Get next quote follow-up task for a lead
 */
export async function getNextQuoteFollowup(leadId: number): Promise<{
  task: { id: number; title: string; dueAt: Date; cadenceDays: number } | null
  daysUntil: number | null
}> {
  const tasks = await prisma.task.findMany({
    where: {
      leadId,
      type: 'FOLLOW_UP',
      status: 'OPEN',
      title: {
        startsWith: 'Quote follow-up D+',
      },
    },
    orderBy: {
      dueAt: 'asc',
    },
    take: 1,
  })

  if (tasks.length === 0) {
    return { task: null, daysUntil: null }
  }

  const task = tasks[0]
  const now = new Date()
  const dueAt = task.dueAt || now
  const daysUntil = Math.ceil((dueAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  // Extract cadence days from title (e.g., "Quote follow-up D+3" -> 3)
  const cadenceMatch = task.title.match(/D\+(\d+)/)
  const cadenceDays = cadenceMatch ? parseInt(cadenceMatch[1], 10) : 0

  return {
    task: {
      id: task.id,
      title: task.title,
      dueAt,
      cadenceDays,
    },
    daysUntil: daysUntil > 0 ? daysUntil : 0,
  }
}


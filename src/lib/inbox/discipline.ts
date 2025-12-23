import { prisma } from '@/lib/prisma'
import { computeConversationFlags } from './intelligence'
import { format } from 'date-fns'
import { toZonedTime as utcToZonedTime } from 'date-fns-tz'

const DUBAI_TZ = 'Asia/Dubai'

// Task types
const TASK_TYPE_REPLY_WHATSAPP = 'REPLY_WHATSAPP'
const TASK_TYPE_ESCALATION = 'ESCALATION'

/**
 * Generate idempotency key for task creation
 */
function generateIdempotencyKey(
  type: 'needs_reply' | 'sla_breach',
  conversationId: number,
  date?: Date
): string {
  const now = date || new Date()
  const dubaiDate = utcToZonedTime(now, DUBAI_TZ)
  const dateKey = format(dubaiDate, 'yyyy-MM-dd')
  const hour = dubaiDate.getHours()

  if (type === 'needs_reply') {
    return `needs_reply:${conversationId}:${dateKey}:${hour}`
  } else {
    return `sla_breach:${conversationId}:${dateKey}`
  }
}

/**
 * Get default agent ID (first available agent or admin)
 */
async function getDefaultAgentId(): Promise<number | null> {
  const agent = await prisma.user.findFirst({
    where: {
      OR: [{ role: 'AGENT' }, { role: 'ADMIN' }],
    },
    orderBy: { id: 'asc' },
  })
  return agent?.id || null
}

/**
 * Get manager user ID for escalations
 */
async function getManagerId(): Promise<number | null> {
  const manager = await prisma.user.findFirst({
    where: {
      OR: [{ role: 'MANAGER' }, { role: 'ADMIN' }],
    },
    orderBy: { id: 'asc' },
  })
  return manager?.id || null
}

/**
 * Create task for conversation that needs reply
 */
async function createNeedsReplyTask(conversationId: number): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: {
        include: { assignedUser: true },
      },
      assignedUser: true,
    },
  })

  if (!conversation) return

  const idempotencyKey = generateIdempotencyKey('needs_reply', conversationId)
  
  // Check if task already exists
  const existingTask = await prisma.task.findFirst({
    where: {
      conversationId: conversationId,
      type: TASK_TYPE_REPLY_WHATSAPP,
      status: 'OPEN',
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  })

  if (existingTask) {
    console.log(`Task already exists for conversation ${conversationId}, skipping`)
    return
  }

  // Determine assigned user
  const assignedUserId =
    conversation.assignedUserId ||
    conversation.lead?.assignedUserId ||
    (await getDefaultAgentId())

  if (!assignedUserId || !conversation.leadId) {
    console.warn(`Cannot create task for conversation ${conversationId}: no assigned user or lead`)
    return
  }

  const contactName = conversation.contact.fullName || conversation.contact.phone

  try {
    await prisma.task.create({
      data: {
        leadId: conversation.leadId,
        conversationId: conversationId,
        title: `Reply to WhatsApp: ${contactName}`,
        type: TASK_TYPE_REPLY_WHATSAPP,
        dueAt: new Date(),
        status: 'OPEN',
        assignedUserId,
        aiSuggested: false,
        idempotencyKey: idempotencyKey,
      },
    })

    console.log(`✅ Created needs-reply task for conversation ${conversationId}`)
  } catch (error: any) {
    // Handle unique constraint or other errors gracefully
    if (error.code === 'P2002') {
      console.log(`Task already exists for conversation ${conversationId}`)
    } else {
      console.error(`Failed to create needs-reply task:`, error)
    }
  }
}

/**
 * Create escalation task for SLA breach
 */
async function createSlaBreachTask(conversationId: number): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: {
        select: {
          id: true,
          stage: true,
          aiScore: true,
          nextFollowUpAt: true,
          // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
        },
      },
    },
  })

  if (!conversation) return

  const idempotencyKey = generateIdempotencyKey('sla_breach', conversationId)

  // Check if escalation task already exists today
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const existingTask = await prisma.task.findFirst({
    where: {
      conversationId: conversationId,
      type: TASK_TYPE_ESCALATION,
      status: 'OPEN',
      createdAt: {
        gte: today,
      },
    },
  })

  if (existingTask) {
    console.log(`Escalation task already exists for conversation ${conversationId} today, skipping`)
    return
  }

  const managerId = await getManagerId()
  if (!managerId || !conversation.leadId) {
    console.warn(`Cannot create escalation task: no manager or lead`)
    return
  }

  const contactName = conversation.contact.fullName || conversation.contact.phone

  try {
    await prisma.task.create({
      data: {
        leadId: conversation.leadId,
        conversationId: conversationId,
        title: `SLA breach: ${contactName} needs urgent reply`,
        type: TASK_TYPE_ESCALATION,
        dueAt: new Date(),
        status: 'OPEN',
        assignedUserId: managerId,
        aiSuggested: false,
        idempotencyKey: idempotencyKey,
      },
    })

    console.log(`✅ Created SLA breach escalation task for conversation ${conversationId}`)
  } catch (error: any) {
    if (error.code === 'P2002') {
      console.log(`Escalation task already exists for conversation ${conversationId}`)
    } else {
      console.error(`Failed to create escalation task:`, error)
    }
  }
}

/**
 * Apply discipline rules to a conversation (create tasks if needed)
 */
export async function applyDisciplineRules(conversationId: number): Promise<void> {
  try {
    const flags = await computeConversationFlags(conversationId)

    // Rule 1: Needs Reply task
    if (flags.NEEDS_REPLY) {
      await createNeedsReplyTask(conversationId)
    }

    // Rule 2: SLA Breach escalation
    if (flags.SLA_BREACH) {
      await createSlaBreachTask(conversationId)
    }
  } catch (error) {
    console.error(`Failed to apply discipline rules for conversation ${conversationId}:`, error)
  }
}

/**
 * Apply discipline rules to all open WhatsApp conversations
 */
export async function applyDisciplineRulesBatch(): Promise<{
  processed: number
  tasksCreated: number
  errors: string[]
}> {
  const results = {
    processed: 0,
    tasksCreated: 0,
    errors: [] as string[],
  }

  try {
    // Get all open WhatsApp conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        channel: 'whatsapp',
        status: 'open',
      },
      select: { id: true },
    })

    console.log(`Processing ${conversations.length} conversations for discipline rules...`)

    // Process in batches
    const batchSize = 10
    for (let i = 0; i < conversations.length; i += batchSize) {
      const batch = conversations.slice(i, i + batchSize)
      
      await Promise.all(
        batch.map(async (conv) => {
          try {
            const beforeCount = await prisma.task.count({
              where: {
                type: { in: [TASK_TYPE_REPLY_WHATSAPP, TASK_TYPE_ESCALATION] },
                status: 'OPEN',
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            })

            await applyDisciplineRules(conv.id)

            const afterCount = await prisma.task.count({
              where: {
                type: { in: [TASK_TYPE_REPLY_WHATSAPP, TASK_TYPE_ESCALATION] },
                status: 'OPEN',
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            })

            results.processed++
            if (afterCount > beforeCount) {
              results.tasksCreated++
            }
          } catch (error: any) {
            results.errors.push(`Conversation ${conv.id}: ${error.message}`)
          }
        })
      )
    }

    console.log(
      `✅ Discipline rules applied: ${results.processed} processed, ${results.tasksCreated} tasks created`
    )
  } catch (error: any) {
    results.errors.push(`Batch processing failed: ${error.message}`)
  }

  return results
}
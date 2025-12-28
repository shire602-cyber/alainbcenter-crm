/**
 * TASK DEDUPLICATION
 * 
 * Ensures only ONE task per lead per type per day
 * Uses upsert logic to prevent duplicates
 */

import { prisma } from '../prisma'
import { format } from 'date-fns'

/**
 * Create or update task with deduplication
 * Enforces uniqueness: (leadId, taskType, date)
 */
export async function upsertTask(data: {
  leadId: number
  type: string
  title: string
  dueAt?: Date
  assignedUserId?: number | null
  conversationId?: number | null
  expiryItemId?: number | null
  idempotencyKey?: string
  aiSuggested?: boolean
}): Promise<number> {
  const dateKey = data.dueAt ? format(data.dueAt, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  const uniqueKey = `${data.leadId}_${data.type}_${dateKey}`
  
  // Try to find existing task
  const existing = await prisma.task.findFirst({
    where: {
      leadId: data.leadId,
      type: data.type,
      dueAt: data.dueAt
        ? {
            gte: new Date(new Date(data.dueAt).setHours(0, 0, 0, 0)),
            lt: new Date(new Date(data.dueAt).setHours(23, 59, 59, 999)),
          }
        : {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
      status: 'OPEN',
    },
  })

  if (existing) {
    // Update existing task
    const updated = await prisma.task.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        dueAt: data.dueAt,
        assignedUserId: data.assignedUserId,
        conversationId: data.conversationId,
        expiryItemId: data.expiryItemId,
        idempotencyKey: data.idempotencyKey || uniqueKey,
        aiSuggested: data.aiSuggested ?? false,
        updatedAt: new Date(),
      },
    })
    return updated.id
  }

  // Create new task
  const created = await prisma.task.create({
    data: {
      leadId: data.leadId,
      type: data.type,
      title: data.title,
      dueAt: data.dueAt,
      assignedUserId: data.assignedUserId,
      conversationId: data.conversationId,
      expiryItemId: data.expiryItemId,
      idempotencyKey: data.idempotencyKey || uniqueKey,
      aiSuggested: data.aiSuggested ?? false,
      status: 'OPEN',
    },
  })
  return created.id
}

/**
 * Check if task already exists (for quick checks)
 */
export async function taskExists(
  leadId: number,
  type: string,
  date?: Date
): Promise<boolean> {
  const targetDate = date || new Date()
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)

  const count = await prisma.task.count({
    where: {
      leadId,
      type,
      dueAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: 'OPEN',
    },
  })

  return count > 0
}


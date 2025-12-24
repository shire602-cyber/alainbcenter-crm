/**
 * Queue automation jobs for background processing
 */

import { prisma } from '../prisma'

export interface QueueJobOptions {
  priority?: number
  delay?: number // milliseconds
  maxRetries?: number
}

/**
 * Queue an automation job
 */
export async function queueAutomationJob(
  type: 'inbound_message' | 'scheduled_autopilot' | 'followup_due' | 'expiry_reminder',
  data: any,
  options: QueueJobOptions = {}
): Promise<string> {
  const { priority = 0, delay = 0, maxRetries = 3 } = options

  // If delay is specified, calculate scheduled time
  const scheduledAt = delay > 0 
    ? new Date(Date.now() + delay)
    : new Date()

  const job = await prisma.automationJob.create({
    data: {
      type,
      data: JSON.stringify(data), // Store as JSON string for SQLite compatibility
      priority,
      maxRetries,
      status: 'PENDING',
      createdAt: scheduledAt,
    },
  })

  console.log(`✅ Queued automation job ${job.id} (type: ${type}, priority: ${priority})`)
  return job.id
}

/**
 * Queue inbound message automation
 */
export async function queueInboundMessageJob(
  leadId: number,
  message: {
    id: number
    direction: string
    channel: string
    body: string | null
    createdAt: Date
  }
): Promise<string> {
  return queueAutomationJob(
    'inbound_message',
    {
      leadId,
      message: {
        id: message.id,
        direction: message.direction,
        channel: message.channel,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    },
    {
      priority: 10, // High priority for inbound messages
      maxRetries: 3,
    }
  )
}


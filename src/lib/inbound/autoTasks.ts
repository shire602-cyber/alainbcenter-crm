/**
 * AUTO-CREATE TASKS/ALERTS
 * 
 * Creates tasks automatically based on inbound message context.
 * All tasks use idempotency keys to prevent duplicates.
 */

import { prisma } from '../prisma'
import { format } from 'date-fns'

export interface AutoTaskInput {
  leadId: number
  conversationId: number
  channel: string
  service?: string
  expiries?: Array<{ type: string; date: Date }>
  providerMessageId: string
}

/**
 * Create auto-tasks based on context
 */
export async function createAutoTasks(input: AutoTaskInput): Promise<number> {
  let tasksCreated = 0
  const today = format(new Date(), 'yyyy-MM-dd')

  // Task 1: Reply due (always create unless auto-reply succeeded)
  // Note: This will be marked as DONE if auto-reply succeeds
  const replyTaskKey = `reply:${input.leadId}:${input.providerMessageId}`
  try {
    await prisma.task.create({
      data: {
        leadId: input.leadId,
        conversationId: input.conversationId,
        title: 'Reply due',
        type: 'REPLY_WHATSAPP',
        dueAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        status: 'OPEN',
        idempotencyKey: replyTaskKey,
        aiSuggested: true,
      },
    })
    tasksCreated++
    console.log(`✅ [AUTO-TASKS] Created reply task`)
  } catch (error: any) {
    if (error.code !== 'P2002') {
      // Not a duplicate constraint, rethrow
      throw error
    }
    // Duplicate - already exists, skip
  }

  // Task 2: Service-specific tasks
  if (input.service === 'MAINLAND_BUSINESS_SETUP' || input.service === 'FREEZONE_BUSINESS_SETUP') {
    // Quote task (due end of day)
    const quoteTaskKey = `quote:${input.leadId}:${today}`
    try {
      const endOfDay = new Date()
      endOfDay.setHours(23, 59, 59, 999)

      await prisma.task.create({
        data: {
          leadId: input.leadId,
          conversationId: input.conversationId,
          title: 'Send quotation',
          type: 'DOCUMENT_REQUEST', // Using existing type
          dueAt: endOfDay,
          status: 'OPEN',
          idempotencyKey: quoteTaskKey,
          aiSuggested: true,
        },
      })
      tasksCreated++
      console.log(`✅ [AUTO-TASKS] Created quote task`)
    } catch (error: any) {
      if (error.code !== 'P2002') {
        throw error
      }
    }
  } else if (
    input.service === 'FAMILY_VISA' ||
    input.service === 'FREELANCE_VISA' ||
    input.service === 'VISIT_VISA' ||
    input.service === 'GOLDEN_VISA'
  ) {
    // Qualification task (due in 2 hours)
    const qualifyTaskKey = `qualify:${input.leadId}:${today}`
    try {
      const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000)

      await prisma.task.create({
        data: {
          leadId: input.leadId,
          conversationId: input.conversationId,
          title: 'Qualify lead',
          type: 'FOLLOW_UP',
          dueAt: twoHoursLater,
          status: 'OPEN',
          idempotencyKey: qualifyTaskKey,
          aiSuggested: true,
        },
      })
      tasksCreated++
      console.log(`✅ [AUTO-TASKS] Created qualification task`)
    } catch (error: any) {
      if (error.code !== 'P2002') {
        throw error
      }
    }
  }

  // Task 3: Expiry tasks
  if (input.expiries && input.expiries.length > 0) {
    for (const expiry of input.expiries) {
      // Create LeadExpiry record
      try {
        const expiryItem = await prisma.expiryItem.create({
          data: {
            contactId: (await prisma.lead.findUnique({ where: { id: input.leadId }, select: { contactId: true } }))!
              .contactId,
            leadId: input.leadId,
            type: expiry.type,
            expiryDate: expiry.date,
            reminderScheduleDays: JSON.stringify([90, 60, 30, 7, 3, 1]),
            remindersEnabled: true,
            stopRemindersAfterReply: true,
            renewalStatus: 'NOT_STARTED',
          },
        })

        // Create renewal follow-up task
        const renewalTaskKey = `renewal:${input.leadId}:${expiry.type}:${format(expiry.date, 'yyyy-MM-dd')}`
        try {
          // Calculate next reminder date (90 days before expiry)
          const nextReminder = new Date(expiry.date)
          nextReminder.setDate(nextReminder.getDate() - 90)

          await prisma.task.create({
            data: {
              leadId: input.leadId,
              expiryItemId: expiryItem.id,
              title: `Renewal follow-up: ${expiry.type}`,
              type: 'RENEWAL_FOLLOWUP',
              dueAt: nextReminder > new Date() ? nextReminder : new Date(),
              status: 'OPEN',
              idempotencyKey: renewalTaskKey,
              aiSuggested: true,
            },
          })
          tasksCreated++
          console.log(`✅ [AUTO-TASKS] Created renewal task for ${expiry.type}`)
        } catch (error: any) {
          if (error.code !== 'P2002') {
            throw error
          }
        }
      } catch (error: any) {
        console.error(`❌ [AUTO-TASKS] Failed to create expiry item:`, error.message)
        // Continue with other tasks
      }
    }
  }

  return tasksCreated
}


/**
 * PROCESS RENEWAL REMINDERS
 * 
 * Cron job that processes renewal reminders.
 * Runs every 5-15 minutes.
 * 
 * Flow:
 * 1. Fetch renewals where status=ACTIVE, reminder_stage < 3, next_reminder_at <= now
 * 2. For each renewal:
 *    - Check if user replied recently (pause if < 24h)
 *    - Determine stageToSend = reminder_stage + 1
 *    - Send on configured channels using template registry + centralized vars
 *    - On success: update reminder_stage, last_reminded_at, next_reminder_at
 */

import { prisma } from '../prisma'
import { buildRenewalTemplateVars, REMINDER_OFFSETS_DAYS } from './templateMapping'
import { getRenewalTemplate, getRenewalChannels, type RenewalChannel } from './templateRegistry'
import { sendTemplate } from '../ai/orchestrator'

export interface ProcessRenewalRemindersResult {
  ok: boolean
  processed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

/**
 * Compute next reminder date from expiry date and stage
 */
function computeNextReminderAt(
  expiryDate: Date,
  currentStage: number
): Date | null {
  if (currentStage >= REMINDER_OFFSETS_DAYS.length) {
    return null // All reminders sent
  }

  const offsetDays = REMINDER_OFFSETS_DAYS[currentStage]
  const nextDate = new Date(expiryDate)
  nextDate.setDate(nextDate.getDate() - offsetDays)
  
  return nextDate
}

/**
 * Process renewal reminders
 * 
 * @param options - Processing options
 * @returns Processing result
 */
export async function processRenewalReminders(
  options: {
    max?: number
    dryRun?: boolean
  } = {}
): Promise<ProcessRenewalRemindersResult> {
  const { max = 50, dryRun = false } = options
  
  const now = new Date()
  const sent: number[] = []
  const skipped: number[] = []
  const failed: number[] = []
  const errors: string[] = []

  try {
    // Fetch renewals that need reminders (using new Renewal model)
    // Note: This file may need refactoring for new renewal system
    const renewals = await prisma.renewal.findMany({
      where: {
        status: 'ACTIVE',
        nextFollowUpAt: { lte: now },
        expiryDate: { gt: now }, // Not expired yet
      },
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
        Contact: true,
        Conversation: true,
      },
      take: max,
      orderBy: {
        nextFollowUpAt: 'asc',
      },
    })

    console.log(`[RENEWAL-JOB] Found ${renewals.length} renewal(s) needing reminders`)

    for (const renewal of renewals) {
      try {
        // Check if user replied recently (pause if < 24h)
        const lastInboundAt = renewal.Conversation?.lastInboundAt
        if (lastInboundAt) {
          const hoursSinceLastInbound =
            (now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
          
          if (hoursSinceLastInbound < 24) {
            // User replied recently - reschedule to now + 24h
            const rescheduleTo = new Date(now.getTime() + 24 * 60 * 60 * 1000)
            await prisma.renewal.update({
              where: { id: renewal.id },
              data: { nextFollowUpAt: rescheduleTo },
            })
            
            console.log(
              `[RENEWAL-JOB] RENEWAL_SKIPPED renewalId=${renewal.id} reason=user_replied_recently hoursSinceLastInbound=${Math.round(hoursSinceLastInbound * 10) / 10} rescheduledTo=${rescheduleTo.toISOString()}`
            )
            skipped.push(renewal.id)
            continue
          }
        }

        // Determine stage to send (default to stage 1 for now, since reminderStage was removed)
        const stageToSend = 1 as 1 | 2 | 3

        // Get template variables
        const { vars } = await buildRenewalTemplateVars(renewal.id)

        // Get configured channels
        const channels = getRenewalChannels()

        // Ensure conversation exists
        let conversationId = renewal.conversationId
        if (!conversationId && renewal.lead?.contact) {
          // Create conversation if missing
          const { upsertConversation } = await import('../conversation/upsert')
          const { getExternalThreadId } = await import('../conversation/getExternalThreadId')
          
          const conversation = await upsertConversation({
            contactId: renewal.lead.contact.id,
            channel: 'whatsapp',
            leadId: renewal.leadId,
            externalThreadId: getExternalThreadId('whatsapp', renewal.lead.contact),
          })
          
          conversationId = conversation.id
          
          // Update renewal with conversation ID
          await prisma.renewal.update({
            where: { id: renewal.id },
            data: { conversationId },
          })
        }

        // Send on each configured channel
        let allChannelsSucceeded = true
        const channelResults: Array<{ channel: string; success: boolean; messageId?: string }> = []

        for (const channel of channels) {
          try {
            const templateName = getRenewalTemplate(channel as RenewalChannel, stageToSend)
            const idempotencyKey = `renewal:${channel}:${renewal.id}:stage:${stageToSend}`

            console.log(
              `[RENEWAL-JOB] RENEWAL_JOB_PICKED renewalId=${renewal.id} stage=${stageToSend} channel=${channel} template=${templateName}`
            )

            // Check idempotency (create record BEFORE sending)
            const existingNotification = await prisma.renewalNotification.findUnique({
              where: { idempotencyKey },
            })

            if (existingNotification && existingNotification.status === 'SENT') {
              console.log(
                `[RENEWAL-JOB] RENEWAL_DEDUP_HIT idempotencyKey=${idempotencyKey.substring(0, 32)}...`
              )
              channelResults.push({ channel, success: true, messageId: existingNotification.messageId || undefined })
              continue
            }

            if (dryRun) {
              console.log(`[RENEWAL-JOB] DRY_RUN - would send template=${templateName} vars=${JSON.stringify(vars)}`)
              channelResults.push({ channel, success: true })
              continue
            }

            // Get phone number
            const contact = renewal.lead?.contact || renewal.Contact
            if (!contact) {
              throw new Error(`Renewal ${renewal.id} has no contact information`)
            }
            const phone = contact.phone
            if (!phone) {
              throw new Error(`Contact ${contact.id} has no phone number`)
            }

            // Create notification record BEFORE sending (idempotency)
            let notificationId: number
            try {
              const notification = await prisma.renewalNotification.create({
                data: {
                  renewalId: renewal.id,
                  channel,
                  stage: stageToSend,
                  templateName,
                  reminderDate: new Date(),
                  idempotencyKey,
                  status: 'PENDING',
                },
              })
              notificationId = notification.id
            } catch (createError: any) {
              // Unique constraint violation = duplicate
              if (createError.code === 'P2002') {
                console.log(
                  `[RENEWAL-JOB] RENEWAL_DEDUP_HIT (DB constraint) idempotencyKey=${idempotencyKey.substring(0, 32)}...`
                )
                channelResults.push({ channel, success: true })
                continue
              }
              throw createError
            }

            // Send template via orchestrator
            const sendResult = await sendTemplate({
              conversationId: conversationId!,
              leadId: renewal.leadId,
              contactId: contact.id,
              phone,
              templateName,
              templateParams: vars,
              language: 'en_US',
              idempotencyKey,
            })

            if (sendResult.success && sendResult.messageId) {
              // Update notification record
              await prisma.renewalNotification.update({
                where: { id: notificationId },
                data: {
                  status: 'SENT',
                  messageId: sendResult.messageId,
                  sentAt: new Date(),
                },
              })

              console.log(
                `[RENEWAL-JOB] RENEWAL_SENT renewalId=${renewal.id} channel=${channel} stage=${stageToSend} notificationId=${notificationId} messageId=${sendResult.messageId}`
              )
              channelResults.push({ channel, success: true, messageId: sendResult.messageId })
            } else {
              // Update notification record with error
              await prisma.renewalNotification.update({
                where: { id: notificationId },
                data: {
                  status: 'FAILED',
                  error: sendResult.error || 'Send failed',
                },
              })

              console.error(
                `[RENEWAL-JOB] RENEWAL_FAILED renewalId=${renewal.id} channel=${channel} error=${sendResult.error}`
              )
              channelResults.push({ channel, success: false })
              allChannelsSucceeded = false
            }
          } catch (channelError: any) {
            console.error(
              `[RENEWAL-JOB] Channel error renewalId=${renewal.id} channel=${channel}:`,
              channelError.message
            )
            channelResults.push({ channel, success: false })
            allChannelsSucceeded = false
          }
        }

        // Update renewal if at least one channel succeeded
        if (allChannelsSucceeded || channelResults.some(r => r.success)) {
          // Calculate next follow-up (7 days from now as default)
          const nextFollowUpAt = new Date(now)
          nextFollowUpAt.setDate(nextFollowUpAt.getDate() + 7)
          
          await prisma.renewal.update({
            where: { id: renewal.id },
            data: {
              lastContactedAt: now,
              nextFollowUpAt,
            },
          })

          sent.push(renewal.id)
        } else {
          failed.push(renewal.id)
          errors.push(`Renewal ${renewal.id}: All channels failed`)
        }
      } catch (renewalError: any) {
        console.error(`[RENEWAL-JOB] Error processing renewal ${renewal.id}:`, renewalError.message)
        failed.push(renewal.id)
        errors.push(`Renewal ${renewal.id}: ${renewalError.message}`)
      }
    }

    return {
      ok: true,
      processed: renewals.length,
      sent: sent.length,
      skipped: skipped.length,
      failed: failed.length,
      errors,
    }
  } catch (error: any) {
    console.error(`[RENEWAL-JOB] Fatal error:`, error)
    return {
      ok: false,
      processed: sent.length + skipped.length + failed.length,
      sent: sent.length,
      skipped: skipped.length,
      failed: failed.length,
      errors: [error.message || 'Unknown error'],
    }
  }
}

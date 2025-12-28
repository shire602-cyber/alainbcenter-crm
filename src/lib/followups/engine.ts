/**
 * FOLLOW-UPS & REMINDERS AUTOPILOT
 * 
 * Phase 6: Automated follow-up schedule:
 * - Day 2
 * - Day 5
 * - Day 12
 * - Day 22 → mark Cold
 * 
 * Rules:
 * - Stop if customer replies
 * - Never sound desperate
 * - Neutral professional tone
 * - One short message
 */

import { prisma } from '../prisma'
import { differenceInDays, addDays, isPast } from 'date-fns'
import { sendOutboundWithIdempotency } from '../outbound/sendWithIdempotency'
import { generateAIAutoresponse } from '../aiMessaging'
import { upsertConversation } from '../conversation/upsert'
import { getExternalThreadId } from '../conversation/getExternalThreadId'

const FOLLOWUP_SCHEDULE = [2, 5, 12, 22] // Days after last contact

/**
 * Process follow-ups due today
 */
export async function processFollowupsDue(options?: { dryRun?: boolean }): Promise<{
  processed: number
  sent: number
  skipped: number
  errors: number
}> {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = addDays(today, 1)

  // Find leads with follow-ups due today
  const leadsWithFollowups = await prisma.lead.findMany({
    where: {
      nextFollowUpAt: {
        gte: today,
        lt: tomorrow,
      },
      stage: {
        notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
      },
      autopilotEnabled: true,
    },
    include: {
      contact: true,
      conversations: {
        where: {
          status: 'open',
        },
        take: 1,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5, // Check last 5 messages
          },
        },
      },
    },
    take: 100,
  })

  let processed = 0
  let sent = 0
  let skipped = 0
  let errors = 0

  for (const lead of leadsWithFollowups) {
    processed++

    try {
      // Check if customer replied (stop follow-ups)
      const conversation = lead.conversations[0]
      if (conversation) {
        const lastInbound = conversation.messages.find(
          (m) => m.direction === 'INBOUND' || m.direction === 'IN'
        )
        const lastOutbound = conversation.messages.find(
          (m) => m.direction === 'OUTBOUND' || m.direction === 'OUT'
        )

        // If last message is inbound (customer replied), skip follow-up
        if (lastInbound && lastOutbound) {
          if (lastInbound.createdAt > lastOutbound.createdAt) {
            console.log(`⏭️ [FOLLOWUP] Skipping lead ${lead.id} - customer replied`)
            skipped++
            // Update nextFollowUpAt to next schedule point
            await updateNextFollowup(lead.id, conversation.id)
            continue
          }
        }
      }

      // Calculate which follow-up this is (Day 2, 5, 12, or 22)
      const lastContactAt = lead.lastContactAt || lead.lastInboundAt || lead.createdAt
      const daysSinceContact = differenceInDays(now, lastContactAt)
      const followupIndex = FOLLOWUP_SCHEDULE.findIndex((days) => days === daysSinceContact)

      if (followupIndex === -1) {
        // Not a scheduled follow-up day, skip
        skipped++
        continue
      }

      // Day 22: Mark as Cold instead of sending follow-up
      if (daysSinceContact >= 22) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            stage: 'ON_HOLD',
            notes: lead.notes
              ? `${lead.notes}\n\n[System]: Marked as Cold after 22 days of no response`
              : '[System]: Marked as Cold after 22 days of no response',
          },
        })
        console.log(`❄️ [FOLLOWUP] Marked lead ${lead.id} as Cold (22 days)`)
        skipped++
        continue
      }

      // Generate follow-up message
      if (!options?.dryRun) {
        const conversation = lead.conversations[0]
        if (!conversation) {
          console.warn(`⚠️ [FOLLOWUP] No conversation found for lead ${lead.id}`)
          skipped++
          continue
        }

        // Generate AI follow-up message using orchestrator
        const latestMessage = conversation.messages.find(m => m.direction === 'INBOUND') || conversation.messages[0]
        const inboundText = latestMessage?.body || 'Follow-up'
        const inboundMessageId = latestMessage?.id || 0
        
        const orchestratorResult = await generateAIReply({
          conversationId: conversation.id,
          leadId: lead.id,
          contactId: lead.contactId,
          inboundText,
          inboundMessageId,
          channel: 'whatsapp',
          language: 'en',
        })
        
        const aiResult = {
          success: !!orchestratorResult.replyText && orchestratorResult.replyText.trim().length > 0,
          text: orchestratorResult.replyText || '',
        }

        if (aiResult.success && aiResult.text) {
          // Ensure conversation exists (use canonical upsert)
          const { id: finalConversationId } = await upsertConversation({
            contactId: lead.contactId,
            channel: 'whatsapp',
            leadId: lead.id,
            externalThreadId: getExternalThreadId('whatsapp', lead.contact),
          })
          
          // Send follow-up with idempotency
          const result = await sendOutboundWithIdempotency({
            conversationId: finalConversationId,
            contactId: lead.contactId,
            leadId: lead.id,
            phone: lead.contact.phone,
            text: aiResult.text,
            provider: 'whatsapp',
            triggerProviderMessageId: null, // Follow-up send
            replyType: 'followup',
            lastQuestionKey: null,
            flowStep: null,
          })
          
          if (result.wasDuplicate) {
            console.log(`⚠️ [FOLLOWUPS] Duplicate outbound blocked by idempotency`)
            continue // Skip this lead
          }

          if (!result.success) {
            console.error(`❌ [FOLLOWUPS] Failed to send:`, result.error)
            continue // Skip this lead
          }
          
          // Create message record for tracking (if not already created by idempotency system)
          if (result.messageId) {
            try {
              await prisma.message.create({
                data: {
                  conversationId: finalConversationId,
                  leadId: lead.id,
                  contactId: lead.contactId,
                  direction: 'OUTBOUND',
                  channel: 'whatsapp',
                  type: 'text',
                  body: aiResult.text,
                  providerMessageId: result.messageId,
                  status: 'SENT',
                  sentAt: new Date(),
                },
              })
            } catch (msgError: any) {
              // Non-critical - message may already exist
              if (!msgError.message?.includes('Unique constraint')) {
                console.warn(`⚠️ [FOLLOWUPS] Failed to create Message record:`, msgError.message)
              }
            }
          }

          // Update lead
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              lastOutboundAt: new Date(),
              lastContactAt: new Date(),
            },
          })

          // Update conversation
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              lastOutboundAt: new Date(),
              lastMessageAt: new Date(),
            },
          })

          // Schedule next follow-up
          await updateNextFollowup(lead.id, conversation.id)

          sent++
          console.log(`✅ [FOLLOWUP] Sent follow-up to lead ${lead.id} (Day ${daysSinceContact})`)
        } else {
          console.error(`❌ [FOLLOWUP] Failed to generate AI reply for lead ${lead.id}`)
          errors++
        }
      } else {
        console.log(`[DRY-RUN] Would send follow-up to lead ${lead.id} (Day ${daysSinceContact})`)
        sent++
      }
    } catch (error: any) {
      console.error(`❌ [FOLLOWUP] Error processing lead ${lead.id}:`, error.message)
      errors++
    }
  }

  return { processed, sent, skipped, errors }
}

/**
 * Update next follow-up date based on schedule
 */
async function updateNextFollowup(leadId: number, conversationId: number): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  })

  if (!lead) return

  const lastContactAt = lead.lastContactAt || lead.lastInboundAt || lead.createdAt
  const now = new Date()
  const daysSinceContact = differenceInDays(now, lastContactAt)

  // Find next scheduled follow-up
  const nextFollowupDays = FOLLOWUP_SCHEDULE.find((days) => days > daysSinceContact)

  if (nextFollowupDays) {
    const nextFollowupAt = addDays(lastContactAt, nextFollowupDays)
    await prisma.lead.update({
      where: { id: leadId },
      data: { nextFollowUpAt: nextFollowupAt },
    })
  } else {
    // No more scheduled follow-ups, clear nextFollowUpAt
    await prisma.lead.update({
      where: { id: leadId },
      data: { nextFollowUpAt: null },
    })
  }
}

/**
 * Initialize follow-up schedule for a new lead
 */
export async function initializeFollowupSchedule(leadId: number): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  })

  if (!lead) return

  const lastContactAt = lead.lastContactAt || lead.lastInboundAt || lead.createdAt
  const firstFollowup = addDays(lastContactAt, FOLLOWUP_SCHEDULE[0]) // Day 2

  await prisma.lead.update({
    where: { id: leadId },
    data: { nextFollowUpAt: firstFollowup },
  })
}


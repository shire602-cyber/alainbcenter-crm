import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'
import { createAgentTask } from '@/lib/automation/agentFallback'

/**
 * GET /api/cron/run-reminders
 * Vercel cron endpoint to send scheduled reminders
 * Runs every 5 minutes (configured in vercel.json)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const vercelCronHeader = req.headers.get('x-vercel-cron')
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET || 'change-me-in-production'

    let isAuthorized = false
    if (vercelCronHeader) {
      isAuthorized = true
      console.log('✅ Vercel cron request detected for reminders')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === cronSecret) {
        isAuthorized = true
        console.log('✅ Authorized via CRON_SECRET for reminders')
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized: Missing or invalid authorization' },
        { status: 401 }
      )
    }

    const now = new Date()
    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Find reminders due now (within last 5 minutes to account for cron timing)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
    
    const dueReminders = await prisma.reminder.findMany({
      where: {
        sent: false,
        scheduledAt: {
          lte: now,
          gte: fiveMinutesAgo, // Don't process very old reminders
        },
      },
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
      },
      take: 50, // Process max 50 at a time
    })

    console.log(`📅 Found ${dueReminders.length} reminders due`)

    // Check if within support hours (7am - 9:30pm Dubai time)
    const hour = now.getUTCHours()
    const minute = now.getUTCMinutes()
    // Dubai is UTC+4, so 7:00-21:30 Dubai = 3:00-17:30 UTC
    const dubaiHour = (hour + 4) % 24
    const dubaiMinute = minute
    const dubaiTime = dubaiHour * 60 + dubaiMinute // Total minutes since midnight
    const startTime = 7 * 60 // 7:00 AM = 420 minutes
    const endTime = 21 * 60 + 30 // 9:30 PM = 1290 minutes
    
    const isWithinHours = dubaiTime >= startTime && dubaiTime < endTime
    
    if (!isWithinHours) {
      console.log(`⏭️ Outside support hours (7am-9:30pm Dubai time). Current: ${dubaiHour}:${dubaiMinute.toString().padStart(2, '0')} Dubai time. Skipping reminders.`)
      return NextResponse.json({
        ok: true,
        message: 'Outside support hours - reminders will be sent during 7am-9:30pm Dubai time',
        processed: 0,
        sent: 0,
        failed: 0,
        errors: [],
      })
    }
    
    console.log(`✅ Within support hours (7am-9:30pm Dubai time). Current: ${dubaiHour}:${dubaiMinute.toString().padStart(2, '0')} Dubai time. Processing reminders.`)

        for (const reminder of dueReminders) {
          results.processed++
          
          try {
        const lead = reminder.lead
        const contact = lead.contact

        if (!contact.phone && reminder.channel === 'WHATSAPP') {
          results.failed++
          results.errors.push(`Reminder ${reminder.id}: No phone number for lead ${lead.id}`)
          
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              sent: true,
              sentAt: now,
              error: 'No phone number available',
            },
          })
          continue
        }

        // Determine message to send
        let messageText = reminder.message
        
        if (!messageText && reminder.templateKey) {
          // TODO: Load template from database
          messageText = `Reminder: ${reminder.type} for ${contact.fullName}`
        }
        
        if (!messageText) {
          // Generate default message based on type
          switch (reminder.type) {
            case 'FOLLOW_UP':
              messageText = `Hi ${contact.fullName}, just following up on your inquiry. How can we help you today?`
              break
            case 'EXPIRY':
              messageText = `Hi ${contact.fullName}, this is a reminder about your upcoming expiry. Please contact us to renew.`
              break
            case 'DOCUMENT_REQUEST':
              messageText = `Hi ${contact.fullName}, we need some documents to proceed. Please share them when convenient.`
              break
            default:
              messageText = `Hi ${contact.fullName}, this is a reminder from Alain Business Center.`
          }
        }

        // Send message with idempotency
        if (reminder.channel === 'WHATSAPP' && contact.phone) {
          // Get or create conversation
          const { upsertConversation } = await import('@/lib/conversation/upsert')
          const { getExternalThreadId } = await import('@/lib/conversation/getExternalThreadId')
          
          const { id: conversationId } = await upsertConversation({
            contactId: contact.id,
            channel: 'whatsapp',
            leadId: lead.id,
            externalThreadId: getExternalThreadId('whatsapp', contact),
          })

          const { sendOutboundWithIdempotency } = await import('@/lib/outbound/sendWithIdempotency')
          const result = await sendOutboundWithIdempotency({
            conversationId: conversationId,
            contactId: contact.id,
            leadId: lead.id,
            phone: contact.phone,
            text: messageText,
            provider: 'whatsapp',
            triggerProviderMessageId: null, // Reminder send
            replyType: 'reminder',
            lastQuestionKey: null,
            flowStep: null,
          })

          if (result.wasDuplicate) {
            console.log(`⚠️ [REMINDERS] Duplicate outbound blocked by idempotency for reminder ${reminder.id}`)
            continue // Skip this reminder
          }

          if (!result.success) {
            console.error(`❌ [REMINDERS] Failed to send reminder ${reminder.id}:`, result.error)
            continue // Skip this reminder
          }

          // Use result from idempotency system
          const sendResult = { messageId: result.messageId }
          
          if (sendResult && sendResult.messageId) {
            // Create message record (conversation already exists from upsert above)
            try {
              await prisma.message.create({
                data: {
                  conversationId: conversationId,
                  leadId: lead.id,
                  contactId: contact.id,
                  direction: 'OUTBOUND',
                  channel: 'whatsapp',
                  type: 'text',
                  body: messageText,
                  status: 'SENT',
                  providerMessageId: sendResult.messageId,
                  rawPayload: JSON.stringify({
                    reminderId: reminder.id,
                    reminderType: reminder.type,
                    scheduledAt: reminder.scheduledAt.toISOString(),
                  }),
                  sentAt: now,
                },
              })

              await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                  lastMessageAt: now,
                  lastOutboundAt: now,
                },
              })
            }

            // Mark reminder as sent
            await prisma.reminder.update({
              where: { id: reminder.id },
              data: {
                sent: true,
                sentAt: now,
              },
            })

            results.sent++
            console.log(`✅ Sent reminder ${reminder.id} to lead ${lead.id}`)
          } else {
            throw new Error('No message ID returned from WhatsApp')
          }
        } else if (reminder.channel === 'EMAIL' && contact.email) {
          // TODO: Implement email sending
          results.failed++
          results.errors.push(`Reminder ${reminder.id}: Email sending not yet implemented`)
          
          await prisma.reminder.update({
            where: { id: reminder.id },
            data: {
              sent: true,
              sentAt: now,
              error: 'Email sending not yet implemented',
            },
          })
        } else {
          throw new Error(`Channel ${reminder.channel} not supported or missing contact info`)
        }
      } catch (error: any) {
        results.failed++
        results.errors.push(`Reminder ${reminder.id}: ${error.message}`)
        console.error(`❌ Failed to send reminder ${reminder.id}:`, error)

        // Mark reminder as failed
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: {
            sent: true,
            sentAt: now,
            error: error.message,
          },
        })

        // Create task for human if send failed
        try {
          await createAgentTask(reminder.leadId, 'complex_query', {
            messageText: `Failed to send reminder: ${error.message}`,
          })
        } catch (taskError) {
          console.error('Failed to create task for reminder failure:', taskError)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Reminders processed',
      results,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('Cron reminders error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}


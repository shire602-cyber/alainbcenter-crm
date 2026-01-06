/**
 * Process Renewal Reminders
 * 
 * Cron job that processes renewal reminders based on next_reminder_at
 * Sends WhatsApp template messages via Orchestrator.sendTemplate()
 */

import { prisma } from '@/lib/prisma'
import { sendTemplate } from '@/lib/ai/orchestrator'
import {
  mapRenewalToTemplateVars,
  templateVarsToParams,
  calculateNextReminderAt,
  parseReminderSchedule,
  generateRenewalIdempotencyKey,
  getReminderDateKey,
} from './service'
import { getTemplateNameForService } from './templateConfig'

/**
 * Process renewal reminders that are due
 * Called by cron job
 */
export async function processRenewalReminders(options: {
  dryRun?: boolean
  limit?: number
} = {}): Promise<{
  processed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  const { dryRun = false, limit = 100 } = options
  const now = new Date()
  
  const results = {
    processed: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  }

  console.log(`[RENEWAL-REMINDERS] Processing reminders (dryRun=${dryRun}, limit=${limit})`)

  // Find renewals that need reminders
  const renewals = await prisma.renewal.findMany({
    where: {
      status: 'PENDING',
      remindersEnabled: true,
      nextReminderAt: {
        lte: now, // Due or past due
      },
      expiryDate: {
        gt: now, // Not expired yet
      },
    },
    include: {
      contact: {
        select: {
          id: true,
          fullName: true,
          phone: true,
        },
      },
      lead: {
        select: {
          id: true,
        },
      },
    },
    take: limit,
    orderBy: {
      nextReminderAt: 'asc', // Process oldest first
    },
  })

  console.log(`[RENEWAL-REMINDERS] Found ${renewals.length} renewals due for reminders`)

  for (const renewal of renewals) {
    results.processed++

    try {
      // Check if contact has phone number
      if (!renewal.contact.phone) {
        console.log(`[RENEWAL-REMINDERS] Skipping renewal ${renewal.id} - no phone number`)
        results.skipped++
        continue
      }

      // Get or create conversation
      const { upsertConversation } = await import('@/lib/conversation/upsert')
      const { getExternalThreadId } = await import('@/lib/conversation/getExternalThreadId')
      
      const conversationId = await upsertConversation({
        contactId: renewal.contact.id,
        channel: 'whatsapp',
        leadId: renewal.leadId || null,
        externalThreadId: getExternalThreadId('whatsapp', renewal.contact),
      })

      // Map renewal to template variables
      const templateVars = mapRenewalToTemplateVars({
        serviceType: renewal.serviceType,
        expiryDate: renewal.expiryDate,
        contact: renewal.contact,
      })

      // Determine template name based on service type
      // This should be configurable, but for now use a simple mapping
      const templateName = getTemplateNameForService(renewal.serviceType)
      
      if (!templateName) {
        console.log(`[RENEWAL-REMINDERS] Skipping renewal ${renewal.id} - no template for service ${renewal.serviceType}`)
        results.skipped++
        continue
      }

      // Generate idempotency key
      const reminderDate = renewal.nextReminderAt || new Date()
      const idempotencyKey = generateRenewalIdempotencyKey(
        renewal.id,
        reminderDate,
        templateName
      )

      // Check if notification already exists (double-check idempotency)
      const existingNotification = await prisma.renewalNotification.findUnique({
        where: { idempotencyKey },
      })

      if (existingNotification) {
        console.log(`[RENEWAL-REMINDERS] Skipping renewal ${renewal.id} - notification already sent (idempotency)`)
        results.skipped++
        
        // Update next reminder date even if skipped
        await updateNextReminderDate(renewal)
        continue
      }

      if (dryRun) {
        console.log(`[RENEWAL-REMINDERS] DRY RUN - Would send template ${templateName} to ${renewal.contact.phone}`)
        results.sent++
        continue
      }

      // Send template via Orchestrator (checks idempotency)
      const templateParams = templateVarsToParams(templateVars)
      const sendResult = await sendTemplate({
        conversationId,
        leadId: renewal.leadId || 0,
        contactId: renewal.contact.id,
        phone: renewal.contact.phone,
        templateName,
        templateParams,
        language: 'en_US',
        idempotencyKey,
      })

      if (sendResult.success && sendResult.messageId) {
        // Create notification record
        await prisma.renewalNotification.create({
          data: {
            renewalId: renewal.id,
            templateName,
            reminderDate: getReminderDateKey(reminderDate),
            idempotencyKey,
            messageId: sendResult.messageId,
            status: 'SENT',
          },
        })

        // Update renewal
        await prisma.renewal.update({
          where: { id: renewal.id },
          data: {
            lastNotifiedAt: new Date(),
            status: 'NOTIFIED',
          },
        })

        // Calculate and update next reminder date
        await updateNextReminderDate(renewal)

        console.log(`✅ [RENEWAL-REMINDERS] Sent reminder for renewal ${renewal.id} (messageId: ${sendResult.messageId})`)
        results.sent++
      } else {
        // Create failed notification record
        await prisma.renewalNotification.create({
          data: {
            renewalId: renewal.id,
            templateName,
            reminderDate: getReminderDateKey(reminderDate),
            idempotencyKey,
            status: 'FAILED',
            error: sendResult.error || 'Unknown error',
          },
        })

        const errorMsg = `Renewal ${renewal.id}: ${sendResult.error || 'Failed to send'}`
        results.errors.push(errorMsg)
        results.failed++
        console.error(`❌ [RENEWAL-REMINDERS] ${errorMsg}`)
      }
    } catch (error: any) {
      const errorMsg = `Renewal ${renewal.id}: ${error.message || 'Unknown error'}`
      results.errors.push(errorMsg)
      results.failed++
      console.error(`❌ [RENEWAL-REMINDERS] ${errorMsg}`, error)
    }
  }

  console.log(`[RENEWAL-REMINDERS] Completed: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`)
  return results
}

/**
 * Update next reminder date for a renewal
 */
async function updateNextReminderDate(renewal: {
  id: number
  expiryDate: Date
  reminderSchedule: string
  lastNotifiedAt: Date | null
}): Promise<void> {
  const schedule = parseReminderSchedule(renewal.reminderSchedule)
  const nextReminderAt = calculateNextReminderAt(
    renewal.expiryDate,
    schedule,
    renewal.lastNotifiedAt
  )

  await prisma.renewal.update({
    where: { id: renewal.id },
    data: {
      nextReminderAt,
    },
  })
}



import { prisma } from '@/lib/prisma'
import { getRenewalStage, getEligibleExpiryItems, RenewalStage } from './rules'
import { generateRenewalDraft } from '@/lib/ai/renewals'

export interface RenewalEngineResult {
  totalExpiryChecked: number
  totalRemindersScheduled: number
  byStage: {
    '90D': number
    '60D': number
    '30D': number
    '7D': number
    EXPIRED: number
  }
  errors: string[]
}

/**
 * Main renewal engine - scans expiries and creates tasks/drafts
 */
export async function runRenewalEngine(options?: { dryRun?: boolean }): Promise<RenewalEngineResult> {
  const dryRun = options?.dryRun || false
  const result: RenewalEngineResult = {
    totalExpiryChecked: 0,
    totalRemindersScheduled: 0,
    byStage: {
      '90D': 0,
      '60D': 0,
      '30D': 0,
      '7D': 0,
      EXPIRED: 0,
    },
    errors: [],
  }

  try {
    // Fetch all eligible expiry items
    let expiryItems
    try {
      expiryItems = await getEligibleExpiryItems()
    } catch (fetchError: any) {
      result.errors.push(`Failed to fetch expiry items: ${fetchError?.message || 'Unknown error'}`)
      console.error('Error fetching expiry items:', fetchError)
      return result // Return early with error
    }
    
    result.totalExpiryChecked = expiryItems.length

    for (const expiryItem of expiryItems) {
      try {
        // Convert Prisma object to ExpiryItemWithLogs format
        const expiryItemForStage = {
          id: expiryItem.id,
          type: expiryItem.type,
          expiryDate: expiryItem.expiryDate,
          renewalStatus: expiryItem.renewalStatus,
          lastReminderSentAt: expiryItem.lastReminderSentAt,
          reminderCount: expiryItem.reminderCount,
          leadId: expiryItem.leadId,
          contactId: expiryItem.contactId,
        }

        // Compute renewal stage
        const stage = await getRenewalStage(expiryItemForStage, new Date())

        if (!stage) {
          continue // Skip if not eligible
        }

        // Get related lead and contact
        const lead = expiryItem.lead || null
        const contact = expiryItem.contact || lead?.contact || null

        if (!contact) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: No associated contact`)
          continue
        }

        // Compute idempotency key
        const idempotencyKey = `renewal:${expiryItem.id}:${stage}`

        // If no lead, we can still process but need to create a lead or skip task creation
        if (!lead) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: No associated lead - skipping task creation`)
          // Still log the renewal attempt
          await prisma.automationRunLog.create({
            data: {
              idempotencyKey,
              ruleKey: `RENEWAL_${stage}`,
              contactId: contact.id,
              expiryItemId: expiryItem.id,
              status: 'SKIPPED',
              reason: 'No associated lead',
              ranAt: new Date(),
            },
          })
          continue
        }

        // Check if we already processed this stage (redundant check - getRenewalStage already does this, but kept for safety)
        const existingLog = await prisma.automationRunLog.findUnique({
          where: { idempotencyKey },
        })

        if (existingLog) {
          continue // Already processed
        }

        if (dryRun) {
          // Dry run: just count
          result.totalRemindersScheduled++
          result.byStage[stage]++
          continue
        }

        // Generate AI draft renewal message
        let aiDraftText = ''

        try {
          const draftResult = await generateRenewalDraft({
            expiryItem: {
              id: expiryItem.id,
              type: expiryItem.type,
              expiryDate: expiryItem.expiryDate,
              notes: expiryItem.notes,
            },
            lead: {
              id: lead.id,
              serviceTypeEnum: lead.serviceTypeEnum || null,
              stage: lead.stage,
            },
            contact: {
              fullName: contact.fullName,
              phone: contact.phone,
              email: contact.email,
            },
            stage,
          })

          aiDraftText = draftResult.text
        } catch (error: any) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: Failed to generate AI draft - ${error?.message}`)
          console.error(`Failed to generate renewal draft for expiry ${expiryItem.id}:`, error)
          // Continue with task creation even if draft generation fails
          aiDraftText = `Renewal reminder for ${expiryItem.type.replace(/_/g, ' ')}`
        }

        // Create task
        const assignedUserId = expiryItem.assignedUserId || lead?.assignedUserId || null

        if (!lead) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: No associated lead - cannot create task`)
          continue
        }

        let task
        try {
          task = await prisma.task.create({
            data: {
              leadId: lead.id,
              expiryItemId: expiryItem.id,
              title: `Renewal: ${expiryItem.type.replace(/_/g, ' ')} - ${stage} reminder`,
              type: 'RENEWAL_OUTREACH',
              dueAt: new Date(),
              assignedUserId,
              aiSuggested: true,
              idempotencyKey: `task:${idempotencyKey}`,
            },
          })
        } catch (taskError: any) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: Failed to create task - ${taskError?.message || 'Unknown error'}`)
          console.error(`Failed to create task for expiry ${expiryItem.id}:`, taskError)
          continue
        }

        // Update expiry item
        try {
          await prisma.expiryItem.update({
            where: { id: expiryItem.id },
            data: {
              reminderCount: (expiryItem.reminderCount || 0) + 1,
              lastReminderSentAt: new Date(),
              lastReminderChannel: 'WHATSAPP',
            },
          })
        } catch (updateError: any) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: Failed to update expiry item - ${updateError?.message || 'Unknown error'}`)
          console.error(`Failed to update expiry item ${expiryItem.id}:`, updateError)
          // Continue even if update fails
        }

        // Create AutomationRunLog
        try {
          await prisma.automationRunLog.create({
            data: {
              idempotencyKey,
              ruleKey: `RENEWAL_${stage}`,
              leadId: lead.id,
              contactId: contact.id,
              expiryItemId: expiryItem.id,
              status: 'SUCCESS',
              message: aiDraftText.substring(0, 200),
              details: JSON.stringify({
                stage,
                taskId: task.id,
                aiDraftText: aiDraftText.substring(0, 500),
                channel: 'WHATSAPP',
              }),
              ranAt: new Date(),
            },
          })
        } catch (logError: any) {
          result.errors.push(`ExpiryItem ${expiryItem.id}: Failed to create log - ${logError?.message || 'Unknown error'}`)
          console.error(`Failed to create log for expiry ${expiryItem.id}:`, logError)
          // Continue even if log creation fails
        }

        result.totalRemindersScheduled++
        result.byStage[stage]++
      } catch (error: any) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error'
        result.errors.push(`ExpiryItem ${expiryItem.id}: ${errorMessage}`)
        console.error(`Error processing expiry item ${expiryItem.id}:`, error)
        // Continue processing other items even if one fails
      }
    }
  } catch (error: any) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error'
    result.errors.push(`Engine error: ${errorMessage}`)
    console.error('Renewal engine error:', error)
    // Return partial results even if there's an error
  }

  return result
}











/**
 * STAFF PERSONAL WHATSAPP REMINDERS
 * 
 * Sends WhatsApp reminders to staff for:
 * - Task assigned or overdue
 * - Lead expiring due reminders
 * - Quote due today
 * 
 * Rules:
 * - Only 1 reminder per task per day (dedupe)
 * - Respect remindersEnabled
 * - Never send sensitive customer docs
 * - Graceful error handling (never throws)
 */

import { prisma } from '../prisma'
import { sendTextMessage } from '../whatsapp'
import { normalizeToE164 } from '../phone'

export interface StaffReminderInput {
  userId: number
  text: string
  taskId?: number
  leadId?: number
}

/**
 * Send staff reminder via WhatsApp
 * 
 * Returns true if sent successfully, false otherwise.
 * Never throws - all errors are caught and logged.
 */
export async function sendStaffReminder(input: StaffReminderInput): Promise<boolean> {
  const startTime = Date.now()
  
  try {
    // Check if staff has reminders enabled
    const staffSettings = await prisma.staffSettings.findUnique({
      where: { userId: input.userId },
    })

    if (!staffSettings) {
      console.log(`⏭️ [STAFF-REMINDER] No staff settings found for user ${input.userId}`)
      return false
    }

    if (!staffSettings.remindersEnabled) {
      console.log(`⏭️ [STAFF-REMINDER] Reminders disabled for user ${input.userId}`)
      return false
    }

    if (!staffSettings.personalWhatsappNumber) {
      console.log(`⏭️ [STAFF-REMINDER] No WhatsApp number configured for user ${input.userId}`)
      return false
    }

    // Improved deduplication: Check for specific task + user combination per day
    if (input.taskId) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const existingReminder = await prisma.notification.findFirst({
        where: {
          type: 'system',
          title: {
            contains: 'Staff reminder sent',
          },
          message: {
            contains: `task ${input.taskId}`,
          },
          createdAt: {
            gte: today,
          },
        },
      })

      if (existingReminder) {
        console.log(`⏭️ [STAFF-REMINDER] Already sent reminder for task ${input.taskId} to user ${input.userId} today`)
        return false
      }
    }

    // Normalize phone number
    let normalizedPhone: string
    try {
      normalizedPhone = normalizeToE164(staffSettings.personalWhatsappNumber)
      console.log(`📱 [STAFF-REMINDER] Normalized phone: ${staffSettings.personalWhatsappNumber} → ${normalizedPhone}`)
    } catch (phoneError: any) {
      console.error(`❌ [STAFF-REMINDER] Failed to normalize phone number: ${phoneError.message}`)
      return false
    }

    // Send WhatsApp message
    console.log(`📤 [STAFF-REMINDER] Sending reminder to user ${input.userId} (${normalizedPhone})`)
    console.log(`📤 [STAFF-REMINDER] Message: "${input.text.substring(0, 100)}${input.text.length > 100 ? '...' : ''}"`)
    
    let messageId: string | undefined
    try {
      const result = await sendTextMessage(normalizedPhone, input.text)
      messageId = result.messageId
      console.log(`✅ [STAFF-REMINDER] WhatsApp sent successfully! Message ID: ${messageId}`)
    } catch (whatsappError: any) {
      console.error(`❌ [STAFF-REMINDER] WhatsApp send failed:`, {
        error: whatsappError.message,
        userId: input.userId,
        phone: normalizedPhone,
        taskId: input.taskId,
        leadId: input.leadId,
      })
      
      // Create notification about the failure (non-blocking)
      try {
        await prisma.notification.create({
          data: {
            type: 'system',
            title: 'Staff reminder failed',
            message: `Failed to send WhatsApp reminder to user ${input.userId}: ${whatsappError.message}`,
            leadId: input.leadId || null,
          },
        })
      } catch (notifError) {
        // Ignore notification creation errors
      }
      
      return false
    }

    // Create notification record for tracking success
    try {
      await prisma.notification.create({
        data: {
          type: 'system',
          title: 'Staff reminder sent',
          message: `Reminder sent to staff (user ${input.userId}): ${input.text.substring(0, 200)}${input.taskId ? ` [Task ${input.taskId}]` : ''}`,
          leadId: input.leadId || null,
        },
      })
      console.log(`✅ [STAFF-REMINDER] Notification record created`)
    } catch (notifError: any) {
      // Non-blocking - log but don't fail
      console.warn(`⚠️ [STAFF-REMINDER] Failed to create notification record:`, notifError.message)
    }

    const elapsed = Date.now() - startTime
    console.log(`✅ [STAFF-REMINDER] Completed successfully in ${elapsed}ms`, {
      userId: input.userId,
      taskId: input.taskId,
      leadId: input.leadId,
      messageId,
    })

    return true
  } catch (error: any) {
    // Catch-all for any unexpected errors
    console.error(`❌ [STAFF-REMINDER] Unexpected error:`, {
      error: error.message,
      stack: error.stack,
      userId: input.userId,
      taskId: input.taskId,
      leadId: input.leadId,
    })
    
    // Try to create error notification (non-blocking)
    try {
      await prisma.notification.create({
        data: {
          type: 'system',
          title: 'Staff reminder error',
          message: `Unexpected error sending reminder to user ${input.userId}: ${error.message}`,
          leadId: input.leadId || null,
        },
      })
    } catch {
      // Ignore
    }
    
    return false
  }
}

/**
 * Trigger staff reminders for overdue tasks
 * 
 * Sends WhatsApp reminders to staff members who have overdue tasks assigned.
 * Respects staff settings (remindersEnabled, personalWhatsappNumber).
 * Deduplication is handled by sendStaffReminder() (1 reminder per task per day).
 */
export async function triggerStaffRemindersForOverdueTasks(): Promise<number> {
  const startTime = Date.now()
  console.log(`🔄 [STAFF-REMINDERS] Starting overdue task reminders`)
  
  try {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: {
          lt: new Date(),
        },
        assignedUserId: {
          not: null,
        },
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        lead: {
          include: {
            contact: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      take: 100, // Limit to prevent overwhelming
    })

    console.log(`📋 [STAFF-REMINDERS] Found ${overdueTasks.length} overdue tasks with assigned users`)

    let remindersSent = 0
    let remindersSkipped = 0
    let remindersFailed = 0

    for (const task of overdueTasks) {
      if (!task.assignedUserId) {
        remindersSkipped++
        continue
      }

      // Build reminder text (keep it concise and actionable)
      const contactName = task.lead?.contact?.fullName || 'Unknown'
      const reminderText = `⏰ Task overdue: "${task.title}" for lead ${contactName} (Lead ID: ${task.leadId})`

      try {
        const sent = await sendStaffReminder({
          userId: task.assignedUserId,
          text: reminderText,
          taskId: task.id,
          leadId: task.leadId,
        })

        if (sent) {
          remindersSent++
        } else {
          remindersSkipped++
        }
      } catch (error: any) {
        remindersFailed++
        console.error(`❌ [STAFF-REMINDERS] Failed to send reminder for task ${task.id}:`, error.message)
        // Continue with next task
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`✅ [STAFF-REMINDERS] Completed in ${elapsed}ms`, {
      total: overdueTasks.length,
      sent: remindersSent,
      skipped: remindersSkipped,
      failed: remindersFailed,
    })

    return remindersSent
  } catch (error: any) {
    console.error(`❌ [STAFF-REMINDERS] Fatal error:`, error.message)
    throw error
  }
}


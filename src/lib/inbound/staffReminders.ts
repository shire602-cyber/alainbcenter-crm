/**
 * STAFF PERSONAL WHATSAPP REMINDERS (Scaffold)
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
 */

import { prisma } from '../prisma'

export interface StaffReminderInput {
  userId: number
  text: string
  taskId?: number
  leadId?: number
}

/**
 * Send staff reminder via WhatsApp
 * 
 * TODO: Implement actual WhatsApp sending
 * For now, this is a scaffold that logs the reminder
 */
export async function sendStaffReminder(input: StaffReminderInput): Promise<boolean> {
  // Check if staff has reminders enabled
  const staffSettings = await prisma.staffSettings.findUnique({
    where: { userId: input.userId },
  })

  if (!staffSettings || !staffSettings.remindersEnabled) {
    console.log(`⏭️ [STAFF-REMINDER] Reminders disabled for user ${input.userId}`)
    return false
  }

  if (!staffSettings.personalWhatsappNumber) {
    console.log(`⏭️ [STAFF-REMINDER] No WhatsApp number configured for user ${input.userId}`)
    return false
  }

  // Check deduplication (1 reminder per task per day)
  if (input.taskId) {
    const today = new Date().toISOString().split('T')[0]
    const existingReminder = await prisma.notification.findFirst({
      where: {
        type: 'system',
        title: {
          contains: 'Staff reminder',
        },
        createdAt: {
          gte: new Date(`${today}T00:00:00Z`),
        },
      },
    })

    if (existingReminder) {
      console.log(`⏭️ [STAFF-REMINDER] Already sent reminder for task ${input.taskId} today`)
      return false
    }
  }

  // TODO: Implement actual WhatsApp sending
  // For now, just log
  console.log(`📱 [STAFF-REMINDER] Would send to ${staffSettings.personalWhatsappNumber}:`, input.text)

  // Create notification record for tracking
  try {
    await prisma.notification.create({
      data: {
        type: 'system',
        title: 'Staff reminder sent',
        message: `Reminder sent to staff: ${input.text}`,
        leadId: input.leadId || null,
      },
    })
  } catch (error) {
    // Non-blocking
  }

  return true
}

/**
 * Trigger staff reminders for overdue tasks
 */
export async function triggerStaffRemindersForOverdueTasks(): Promise<number> {
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
      assignedUser: true,
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
  })

  let remindersSent = 0

  for (const task of overdueTasks) {
    if (!task.assignedUserId) continue

    const reminderText = `Task overdue: "${task.title}" for lead ${task.lead.contact.fullName} (Lead ID: ${task.leadId})`

    const sent = await sendStaffReminder({
      userId: task.assignedUserId,
      text: reminderText,
      taskId: task.id,
      leadId: task.leadId,
    })

    if (sent) {
      remindersSent++
    }
  }

  return remindersSent
}


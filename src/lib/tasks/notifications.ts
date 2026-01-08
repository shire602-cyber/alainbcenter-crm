/**
 * Task Notification Helpers
 * 
 * Creates notifications for task events (assign, due soon, overdue, completed)
 */

import { prisma } from '@/lib/prisma'

export interface CreateTaskNotificationParams {
  type: 'task_assigned' | 'task_due_soon' | 'task_overdue' | 'task_completed'
  taskId: number
  leadId: number
  userId?: number // Target user (if null, notifies all assignees)
  title: string
  message: string
}

/**
 * Create notification for task event
 */
export async function createTaskNotification(params: CreateTaskNotificationParams) {
  const { type, taskId, leadId, userId, title, message } = params

  // If userId is specified, create single notification
  if (userId) {
    return await prisma.notification.create({
      data: {
        type,
        title,
        message,
        leadId,
        taskId,
        userId,
        isRead: false,
      },
    })
  }

  // Otherwise, notify all assignees
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignees: {
        include: {
          user: true,
        },
      },
      assignedUser: true, // Legacy single assignee
    },
  })

  if (!task) {
    throw new Error(`Task ${taskId} not found`)
  }

  const userIds = new Set<number>()
  
  // Add assignees from many-to-many
  task.assignees.forEach(ta => userIds.add(ta.userId))
  
  // Add legacy single assignee if exists
  if (task.assignedUserId) {
    userIds.add(task.assignedUserId)
  }

  // Create notifications for all assignees
  const notifications = await Promise.all(
    Array.from(userIds).map(userId =>
      prisma.notification.create({
        data: {
          type,
          title,
          message,
          leadId,
          taskId,
          userId,
          isRead: false,
        },
      })
    )
  )

  return notifications
}

/**
 * Notify admins about task event
 */
export async function notifyAdminsAboutTask(params: Omit<CreateTaskNotificationParams, 'userId'>) {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  return await Promise.all(
    admins.map(admin =>
      prisma.notification.create({
        data: {
          type: params.type,
          title: params.title,
          message: params.message,
          leadId: params.leadId,
          taskId: params.taskId,
          userId: admin.id,
          isRead: false,
        },
      })
    )
  )
}


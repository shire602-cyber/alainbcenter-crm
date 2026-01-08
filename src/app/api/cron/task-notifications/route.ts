import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createTaskNotification, notifyAdminsAboutTask } from '@/lib/tasks/notifications'

/**
 * GET /api/cron/task-notifications
 * Vercel cron endpoint to check for tasks due soon (24h) and overdue
 * Runs every hour (configured in vercel.json)
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
      console.log('✅ Vercel cron request detected for task notifications')
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      if (token === cronSecret) {
        isAuthorized = true
        console.log('✅ Authorized via CRON_SECRET for task notifications')
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
      dueSoonProcessed: 0,
      overdueProcessed: 0,
      notificationsCreated: 0,
      errors: [] as string[],
    }

    // Find tasks due in next 24 hours (due soon)
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const tasksDueSoon = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: {
          gte: now,
          lte: twentyFourHoursFromNow,
        },
        assignees: {
          some: {
            notifiedAt: {
              or: [
                null,
                { lt: oneHourAgo }, // Not notified in last hour
              ],
            },
          },
        },
      },
      include: {
        assignees: {
          include: {
            user: true,
          },
        },
        lead: {
          include: {
            contact: true,
          },
        },
      },
    })

    console.log(`📅 Found ${tasksDueSoon.length} tasks due soon`)

    for (const task of tasksDueSoon) {
      try {
        const hoursUntilDue = Math.round((task.dueAt!.getTime() - now.getTime()) / (1000 * 60 * 60))
        
        await createTaskNotification({
          type: 'task_due_soon',
          taskId: task.id,
          leadId: task.leadId,
          title: `Task due soon: ${task.title}`,
          message: `Task "${task.title}" is due in ${hoursUntilDue} hour${hoursUntilDue !== 1 ? 's' : ''}${task.lead.contact.fullName ? ` for ${task.lead.contact.fullName}` : ''}.`,
        })

        // Update notifiedAt for assignees
        await prisma.taskAssignee.updateMany({
          where: {
            taskId: task.id,
            notifiedAt: {
              or: [
                null,
                { lt: oneHourAgo },
              ],
            },
          },
          data: {
            notifiedAt: now,
          },
        })

        results.dueSoonProcessed++
        results.notificationsCreated += task.assignees.length
      } catch (error: any) {
        results.errors.push(`Task ${task.id} (due soon): ${error.message}`)
        console.error(`❌ Failed to process due soon task ${task.id}:`, error)
      }
    }

    // Find overdue tasks
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: {
          lt: now,
        },
        assignees: {
          some: {
            notifiedAt: {
              or: [
                null,
                { lt: oneHourAgo }, // Not notified in last hour
              ],
            },
          },
        },
      },
      include: {
        assignees: {
          include: {
            user: true,
          },
        },
        lead: {
          include: {
            contact: true,
          },
        },
      },
    })

    console.log(`⚠️ Found ${overdueTasks.length} overdue tasks`)

    for (const task of overdueTasks) {
      try {
        const daysOverdue = Math.floor((now.getTime() - task.dueAt!.getTime()) / (1000 * 60 * 60 * 24))
        
        await createTaskNotification({
          type: 'task_overdue',
          taskId: task.id,
          leadId: task.leadId,
          title: `Task overdue: ${task.title}`,
          message: `Task "${task.title}" is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue${task.lead.contact.fullName ? ` for ${task.lead.contact.fullName}` : ''}.`,
        })

        // Notify admins about overdue tasks
        await notifyAdminsAboutTask({
          type: 'task_overdue',
          taskId: task.id,
          leadId: task.leadId,
          title: `Task overdue: ${task.title}`,
          message: `Task "${task.title}" is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue${task.lead.contact.fullName ? ` for ${task.lead.contact.fullName}` : ''}.`,
        })

        // Update notifiedAt for assignees
        await prisma.taskAssignee.updateMany({
          where: {
            taskId: task.id,
            notifiedAt: {
              or: [
                null,
                { lt: oneHourAgo },
              ],
            },
          },
          data: {
            notifiedAt: now,
          },
        })

        results.overdueProcessed++
        results.notificationsCreated += task.assignees.length
      } catch (error: any) {
        results.errors.push(`Task ${task.id} (overdue): ${error.message}`)
        console.error(`❌ Failed to process overdue task ${task.id}:`, error)
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    console.error('❌ Task notifications cron error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? 'Unknown error in task notifications cron',
      },
      { status: 500 }
    )
  }
}


/**
 * DAILY ALERTS CRON JOB
 * 
 * Finds and creates alerts for:
 * - Overdue tasks
 * - Leads with no reply within 24h
 * - Quotations due today not sent
 * - Expiring items within 90/60/30/7/3/today
 * 
 * Secured by CRON_SECRET environment variable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { format, differenceInDays, isToday } from 'date-fns'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    )
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const startTime = Date.now()
  console.log(`🔄 [DAILY-ALERTS] Starting daily alerts job`)

  const alertsCreated: string[] = []

  try {
    // 1. Find overdue tasks
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: 'OPEN',
        dueAt: {
          lt: new Date(),
        },
      },
      include: {
        lead: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    for (const task of overdueTasks) {
      try {
        await prisma.notification.create({
          data: {
            type: 'task_assigned',
            title: 'Overdue task',
            message: `Task "${task.title}" for lead ${task.lead.contact.fullName} is overdue`,
            leadId: task.leadId,
            conversationId: task.conversationId,
          },
        })
        alertsCreated.push(`Overdue task: ${task.id}`)
      } catch (error: any) {
        // Skip if notification already exists (dedupe by type+leadId)
        if (error.code !== 'P2002') {
          console.error(`Failed to create alert for task ${task.id}:`, error)
        }
      }
    }

    // 2. Find leads with no reply within 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const unrepliedLeads = await prisma.lead.findMany({
      where: {
        lastInboundAt: {
          gte: twentyFourHoursAgo,
        },
        OR: [
          { lastOutboundAt: null },
          { lastOutboundAt: { lt: twentyFourHoursAgo } }, // No outbound or outbound before inbound
        ],
        stage: {
          notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
        },
      },
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    })

    for (const lead of unrepliedLeads) {
      try {
        await prisma.notification.create({
          data: {
            type: 'unreplied_message',
            title: 'No reply sent',
            message: `Lead ${lead.contact.fullName} has not received a reply in 24 hours`,
            leadId: lead.id,
          },
        })
        alertsCreated.push(`Unreplied lead: ${lead.id}`)
      } catch (error: any) {
        if (error.code !== 'P2002') {
          console.error(`Failed to create alert for lead ${lead.id}:`, error)
        }
      }
    }

    // 3. Find quotations due today not sent
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const quoteTasksDue = await prisma.task.findMany({
      where: {
        type: 'DOCUMENT_REQUEST', // Quote tasks use this type
        status: 'OPEN',
        dueAt: {
          gte: today,
          lt: tomorrow,
        },
        lead: {
          quotationSentAt: null, // Quote not sent
        },
      },
      include: {
        lead: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    })

    for (const task of quoteTasksDue) {
      try {
        await prisma.notification.create({
          data: {
            type: 'system',
            title: 'Quote pending',
            message: `Quotation for lead ${task.lead.contact.fullName} is due today`,
            leadId: task.leadId,
          },
        })
        alertsCreated.push(`Quote pending: ${task.leadId}`)
      } catch (error: any) {
        if (error.code !== 'P2002') {
          console.error(`Failed to create alert for quote task:`, error)
        }
      }
    }

    // 4. Find expiring items
    const expiringItems = await prisma.expiryItem.findMany({
      where: {
        remindersEnabled: true,
        renewalStatus: {
          not: 'RENEWED',
        },
      },
      include: {
        lead: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
      },
    })

    for (const item of expiringItems) {
      const daysUntilExpiry = differenceInDays(item.expiryDate, new Date())

      // Check if reminder is due based on schedule
      const schedule = JSON.parse(item.reminderScheduleDays || '[90,60,30,7,3,1]')
      const reminderDue = schedule.some((days: number) => {
        const reminderDate = new Date(item.expiryDate)
        reminderDate.setDate(reminderDate.getDate() - days)
        return isToday(reminderDate) || (reminderDate < new Date() && daysUntilExpiry > 0)
      })

      if (reminderDue && daysUntilExpiry >= 0) {
        try {
          await prisma.notification.create({
            data: {
              type: 'system',
              title: 'Expiry reminder due',
              message: `${item.type.replace(/_/g, ' ')} for lead ${item.lead?.contact.fullName || 'Unknown'} expires in ${daysUntilExpiry} days`,
              leadId: item.leadId,
            },
          })
          alertsCreated.push(`Expiry reminder: ${item.id}`)
        } catch (error: any) {
          if (error.code !== 'P2002') {
            console.error(`Failed to create alert for expiry ${item.id}:`, error)
          }
        }
      }
    }

    console.log(`✅ [DAILY-ALERTS] Completed`, {
      alertsCreated: alertsCreated.length,
      elapsed: `${Date.now() - startTime}ms`,
    })

    return NextResponse.json({
      success: true,
      alertsCreated: alertsCreated.length,
      details: alertsCreated,
    })
  } catch (error: any) {
    console.error(`❌ [DAILY-ALERTS] Error:`, error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { createTaskNotification } from '@/lib/tasks/notifications'

// POST /api/tasks/[id]/nudge
// Send reminder to assignees (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can nudge tasks' },
        { status: 403 }
      )
    }

    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)

    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Invalid task ID' },
        { status: 400 }
      )
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
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

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    // Rate limiting: Don't nudge more than once per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    if (task.lastNudgedAt && task.lastNudgedAt > oneHourAgo) {
      return NextResponse.json(
        { error: 'Task was nudged recently. Please wait before nudging again.' },
        { status: 429 }
      )
    }

    // Update lastNudgedAt
    await prisma.task.update({
      where: { id: taskId },
      data: { lastNudgedAt: new Date() },
    })

    // Create notifications for assignees
    const dueText = task.dueAt 
      ? ` (Due: ${new Date(task.dueAt).toLocaleString()})`
      : task.status === 'OPEN' 
        ? ' (No due date)'
        : ''

    await createTaskNotification({
      type: 'task_assigned',
      taskId: task.id,
      leadId: task.leadId,
      title: `Reminder: ${task.title}`,
      message: `Reminder: Task "${task.title}"${dueText} for lead ${task.lead.contact.fullName || 'Unknown'}.`,
    })

    return NextResponse.json({ 
      success: true,
      message: 'Task nudged successfully',
    })
  } catch (error: any) {
    console.error('POST /api/tasks/[id]/nudge error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error nudging task' },
      { status: 500 }
    )
  }
}


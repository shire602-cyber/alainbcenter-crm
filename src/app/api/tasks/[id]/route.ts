import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { createTaskNotification, notifyAdminsAboutTask } from '@/lib/tasks/notifications'

// PATCH /api/tasks/[id]
// Update task (mark done, update fields, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.id)

    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Invalid task ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Fetch task with assignees
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignees: {
          include: {
            user: true,
          },
        },
        lead: true,
      },
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    const isAdmin = user.role === 'ADMIN'
    const isAssignee = task.assignedUserId === user.id || 
                      task.assignees.some(ta => ta.userId === user.id)
    const isCreator = task.createdByUserId === user.id

    // Check permissions for marking done
    if (body.status === 'DONE' || body.doneAt) {
      if (!isAdmin && !isAssignee) {
        return NextResponse.json(
          { error: 'Only assignees or admins can mark tasks as done' },
          { status: 403 }
        )
      }
    }

    // Build update data
    const updateData: any = {}

    if (body.title !== undefined) {
      updateData.title = body.title.trim()
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null
    }
    if (body.priority !== undefined) {
      const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH']
      if (allowedPriorities.includes(body.priority.toUpperCase())) {
        updateData.priority = body.priority.toUpperCase()
      }
    }
    if (body.dueAt !== undefined) {
      if (body.dueAt === null || body.dueAt === '') {
        updateData.dueAt = null
      } else {
        const parsedDate = new Date(body.dueAt)
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for dueAt' },
            { status: 400 }
          )
        }
        updateData.dueAt = parsedDate
      }
    }
    if (body.status !== undefined) {
      updateData.status = body.status
      if (body.status === 'DONE' && !task.doneAt) {
        updateData.doneAt = new Date()
      } else if (body.status !== 'DONE') {
        updateData.doneAt = null
      }
    }
    if (body.doneAt === 'now' || body.doneAt === true) {
      updateData.status = 'DONE'
      updateData.doneAt = new Date()
    }

    // Update assignees if provided (admin only)
    if (body.assigneeIds !== undefined && isAdmin) {
      const assigneeIds: number[] = Array.isArray(body.assigneeIds)
        ? body.assigneeIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : []

      // Delete existing assignees
      await prisma.taskAssignee.deleteMany({
        where: { taskId },
      })

      // Create new assignees
      if (assigneeIds.length > 0) {
        await prisma.taskAssignee.createMany({
          data: assigneeIds.map(userId => ({
            taskId,
            userId,
            assignedAt: new Date(),
          })),
        })
      }

      // Update legacy single assignee
      updateData.assignedUserId = assigneeIds.length === 1 ? assigneeIds[0] : null
    }

    // Update task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        createdByUser: {
          select: { id: true, name: true, email: true }
        },
        lead: {
          select: { id: true }
        },
      },
    })

    // Create notifications
    if (updateData.status === 'DONE' && !task.doneAt) {
      // Task completed
      try {
        await createTaskNotification({
          type: 'task_completed',
          taskId: updatedTask.id,
          leadId: task.leadId,
          title: `Task completed: ${updatedTask.title}`,
          message: `Task "${updatedTask.title}" has been marked as completed.`,
        })

        // Notify creator and admins
        if (task.createdByUserId && task.createdByUserId !== user.id) {
          await createTaskNotification({
            type: 'task_completed',
            taskId: updatedTask.id,
            leadId: task.leadId,
            userId: task.createdByUserId,
            title: `Task completed: ${updatedTask.title}`,
            message: `Task "${updatedTask.title}" has been completed by ${user.name || 'an assignee'}.`,
          })
        }

        await notifyAdminsAboutTask({
          type: 'task_completed',
          taskId: updatedTask.id,
          leadId: task.leadId,
          title: `Task completed: ${updatedTask.title}`,
          message: `Task "${updatedTask.title}" has been completed.`,
        })
      } catch (notifError) {
        console.error('Failed to create task completion notification:', notifError)
      }
    }

    return NextResponse.json(updatedTask)
  } catch (error: any) {
    console.error('PATCH /api/tasks/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error updating task' },
      { status: 500 }
    )
  }
}

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


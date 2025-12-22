import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PATCH /api/tasks/[taskId]
// Update a task (mark as done, edit fields)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const resolvedParams = await params
    const taskId = parseInt(resolvedParams.taskId)
    
    if (isNaN(taskId)) {
      return NextResponse.json(
        { error: 'Invalid task ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Build update data
    const updateData: any = {}

    if (body.doneAt !== undefined) {
      if (body.doneAt === null || body.doneAt === '') {
        updateData.doneAt = null
      } else if (body.doneAt === 'now') {
        updateData.doneAt = new Date()
      } else {
        const parsedDate = new Date(body.doneAt)
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for doneAt' },
            { status: 400 }
          )
        }
        updateData.doneAt = parsedDate
      }
    }

    if (body.title !== undefined) {
      // Validate title is a string and not empty (matches POST endpoint validation)
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json(
          { error: 'Title must be a non-empty string' },
          { status: 400 }
        )
      }
      updateData.title = body.title.trim()
    }

    if (body.type !== undefined) {
      const allowedTypes = ['CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'DOCUMENT_REQUEST', 'OTHER', 'call', 'meeting', 'email', 'whatsapp', 'other']
      const normalizedType = body.type.toUpperCase()
      if (allowedTypes.includes(normalizedType) || allowedTypes.includes(body.type)) {
        updateData.type = normalizedType
      }
    }

    if (body.status !== undefined) {
      const allowedStatuses = ['OPEN', 'DONE', 'SNOOZED']
      const normalizedStatus = body.status.toUpperCase()
      if (allowedStatuses.includes(normalizedStatus)) {
        updateData.status = normalizedStatus
        if (normalizedStatus === 'DONE' && !updateData.doneAt) {
          updateData.doneAt = new Date()
        }
      }
    }

    if (body.assignedUserId !== undefined) {
      updateData.assignedUserId = body.assignedUserId ? parseInt(body.assignedUserId) : null
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

    // Update task
    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
      },
    })

    return NextResponse.json(task)
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }
    
    console.error('PATCH /api/tasks/[taskId] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error updating task' },
      { status: 500 }
    )
  }
}


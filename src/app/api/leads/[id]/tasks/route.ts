import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { createTaskNotification } from '@/lib/tasks/notifications'

// POST /api/leads/[id]/tasks
// Create a new task for a lead
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Validate required fields
    if (!body.title || !body.title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      )
    }

    // Validate task type (support both old and new formats)
    const allowedTypes = ['CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'DOCUMENT_REQUEST', 'OTHER', 'call', 'meeting', 'email', 'whatsapp', 'other']
    const taskType = body.type && allowedTypes.includes(body.type.toUpperCase())
      ? body.type.toUpperCase()
      : 'OTHER'

    // Validate priority
    const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH', 'low', 'medium', 'high']
    const priority = body.priority && allowedPriorities.includes(body.priority.toUpperCase())
      ? body.priority.toUpperCase()
      : 'MEDIUM'

    // Parse and validate due date + time
    let dueAt: Date | null = null
    if (body.dueAt && body.dueAt !== '') {
      const parsedDate = new Date(body.dueAt)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format for dueAt' },
          { status: 400 }
        )
      }
      dueAt = parsedDate
    }

    // Validate assignees (array of user IDs)
    const assigneeIds: number[] = []
    if (body.assigneeIds && Array.isArray(body.assigneeIds)) {
      assigneeIds.push(...body.assigneeIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)))
    } else if (body.assignedUserId) {
      // Legacy single assignee support
      assigneeIds.push(parseInt(body.assignedUserId))
    }

    // Permission check: Non-admin can only assign to themselves (unless config allows)
    const isAdmin = user.role === 'ADMIN'
    if (!isAdmin && assigneeIds.length > 0) {
      // Non-admin must include themselves if assigning to others
      if (!assigneeIds.includes(user.id)) {
        assigneeIds.push(user.id)
      }
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Create task with new schema fields
    const task = await prisma.task.create({
      data: {
        leadId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        type: taskType,
        priority,
        dueAt,
        status: body.status || 'OPEN',
        assignedUserId: assigneeIds.length === 1 ? assigneeIds[0] : null, // Legacy single assignee
        createdByUserId: user.id,
        aiSuggested: body.aiSuggested || false,
        assignees: assigneeIds.length > 0 ? {
          create: assigneeIds.map(userId => ({
            userId,
            assignedAt: new Date(),
          })),
        } : undefined,
      },
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        createdByUser: {
          select: { id: true, name: true, email: true }
        },
      },
    })

    // Create notifications for assignees
    if (assigneeIds.length > 0) {
      try {
        await createTaskNotification({
          type: 'task_assigned',
          taskId: task.id,
          leadId,
          title: `New task assigned: ${task.title}`,
          message: `You have been assigned a new task: "${task.title}"${task.dueAt ? ` (Due: ${new Date(task.dueAt).toLocaleString()})` : ''}`,
        })
      } catch (notifError) {
        console.error('Failed to create task assignment notification:', notifError)
        // Don't fail task creation if notification fails
      }
    }

    return NextResponse.json(task, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/tasks error:', error)
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    })
    return NextResponse.json(
      { 
        error: error?.message ?? 'Unknown error creating task',
        details: process.env.NODE_ENV === 'development' ? {
          code: error?.code,
          meta: error?.meta,
        } : undefined
      },
      { status: 500 }
    )
  }
}

// GET /api/leads/[id]/tasks
// Get all tasks for a lead
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const tasks = await prisma.task.findMany({
      where: { leadId },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        assignees: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        createdByUser: {
          select: { id: true, name: true, email: true }
        },
      },
      orderBy: [
        { status: 'asc' }, // OPEN first, then DONE
        { priority: 'desc' }, // HIGH first, then MEDIUM, then LOW
        { dueAt: 'asc' }, // Then by due date
        { createdAt: 'desc' }, // Then by creation date
      ],
    })

    return NextResponse.json(tasks)
  } catch (error: any) {
    console.error('GET /api/leads/[id]/tasks error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error fetching tasks' },
      { status: 500 }
    )
  }
}


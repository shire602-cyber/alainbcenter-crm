import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'

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

    // Parse and validate due date
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
        type: taskType,
        dueAt,
        status: body.status || 'OPEN',
        assignedUserId: body.assignedUserId ? parseInt(body.assignedUserId) : null,
        createdByUserId: user.id,
        aiSuggested: body.aiSuggested || false,
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
        createdByUser: {
          select: { id: true, name: true, email: true }
        },
      },
    })

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
        createdByUser: {
          select: { id: true, name: true, email: true }
        },
      },
      orderBy: [
        { status: 'asc' }, // OPEN first, then DONE
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


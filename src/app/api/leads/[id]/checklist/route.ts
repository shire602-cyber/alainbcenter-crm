import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/checklist
// Create a checklist item for a lead
export async function POST(
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

    const body = await req.json()

    // Validate required fields
    if (!body.label || !body.label.trim()) {
      return NextResponse.json(
        { error: 'Label is required' },
        { status: 400 }
      )
    }

    // Validate lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Create checklist item
    const checklistItem = await prisma.checklistItem.create({
      data: {
        leadId,
        label: body.label.trim(),
        required: body.required !== undefined ? Boolean(body.required) : true,
      },
    })

    return NextResponse.json(checklistItem, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/checklist error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error creating checklist item' },
      { status: 500 }
    )
  }
}

// GET /api/leads/[id]/checklist
// Get all checklist items for a lead
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

    const checklistItems = await prisma.checklistItem.findMany({
      where: { leadId },
      orderBy: [
        { completed: 'asc' }, // Uncompleted items first
        { required: 'desc' }, // Required items before optional
        { createdAt: 'asc' },
      ],
    })

    return NextResponse.json(checklistItems)
  } catch (error: any) {
    console.error('GET /api/leads/[id]/checklist error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error fetching checklist' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/inbox/conversations/[id]/state
 * Update conversation state (open/waiting/closed/snoozed)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    // Resolve params (Next.js 15+ can have Promise params)
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    if (isNaN(leadId)) {
      return NextResponse.json({ error: 'Invalid lead ID' }, { status: 400 })
    }

    const body = await req.json()
    const { state } = body

    if (!state || !['open', 'waiting', 'closed', 'snoozed'].includes(state)) {
      return NextResponse.json(
        { error: 'Invalid state. Must be: open, waiting, closed, or snoozed' },
        { status: 400 }
      )
    }

    // Map state to pipelineStage
    let pipelineStage: string = 'new'
    if (state === 'closed') {
      pipelineStage = 'completed'
    } else if (state === 'snoozed') {
      // For snoozed, we could add a field later, for now keep current stage
      // Or we could use a custom field in notes
    }

    // Update lead
    const updateData: any = {}
    if (state === 'closed') {
      updateData.pipelineStage = 'completed'
    }

    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      include: {
        contact: true,
        serviceType: true,
      },
    })

    return NextResponse.json({
      success: true,
      lead: {
        id: lead.id,
        state,
        pipelineStage: lead.pipelineStage,
      },
    })
  } catch (error: any) {
    console.error('PATCH /api/inbox/conversations/[id]/state error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update conversation state' },
      { status: error.statusCode || 500 }
    )
  }
}


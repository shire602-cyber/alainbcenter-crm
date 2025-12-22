import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/ai-refresh
// Re-qualify a lead and refresh AI score and notes
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        serviceType: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // TODO: Implement actual AI qualification logic
    // For now, return a simple score based on activity
    const messageCount = lead.messages?.length || 0
    const aiScore = Math.min(100, 40 + messageCount * 5)
    const aiNotes = `Lead has ${messageCount} messages. Active engagement level: ${aiScore >= 70 ? 'High' : aiScore >= 40 ? 'Medium' : 'Low'}.`

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiScore,
        aiNotes,
      },
    })

    return NextResponse.json({
      success: true,
      aiScore: updated.aiScore,
      aiNotes: updated.aiNotes,
    })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/ai-refresh error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to refresh AI insight' },
      { status: 500 }
    )
  }
}


















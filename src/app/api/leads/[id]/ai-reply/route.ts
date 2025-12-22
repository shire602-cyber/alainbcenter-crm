import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { generateAiReply } from '@/lib/aiReply'

export async function GET(
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

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        serviceType: true,
        communicationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 messages for context
        },
      },
    })

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const result = await generateAiReply(lead as any, lead.communicationLogs)

    return NextResponse.json({
      reply: result.message, // Client expects 'reply' field
      nextFollowUp: result.nextFollowUp.toISOString(),
      suggestedDocs: result.suggestedDocs,
    })
  } catch (error: any) {
    console.error('AI reply generation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate AI reply' },
      { status: error.statusCode || 500 }
    )
  }
}

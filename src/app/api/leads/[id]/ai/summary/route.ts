import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/ai/summary
// Generate AI summary of the lead
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
          take: 20,
        },
        tasks: {
          where: { status: 'OPEN' },
        },
        expiryItems: true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // TODO: Implement actual AI summary generation
    // For now, return a structured summary
    const summary = `
**Lead Summary for ${lead.contact?.fullName || 'Unnamed Lead'}**

**Service:** ${lead.serviceType?.name || 'Not specified'}
**Stage:** ${lead.stage || lead.pipelineStage || 'New'}
**AI Score:** ${lead.aiScore || 'N/A'}/100

**Contact Information:**
- Phone: ${lead.contact?.phone || 'N/A'}
- Email: ${lead.contact?.email || 'N/A'}
- Source: ${lead.contact?.source || 'Unknown'}

**Activity:**
- ${lead.messages?.length || 0} messages exchanged
- ${lead.tasks?.length || 0} open tasks
- ${lead.expiryItems?.length || 0} tracked expiry items

**Next Steps:**
${lead.nextFollowUpAt ? `- Follow-up scheduled for ${new Date(lead.nextFollowUpAt).toLocaleDateString()}` : '- No follow-up scheduled'}
${lead.tasks && lead.tasks.length > 0 ? `- ${lead.tasks.length} pending tasks` : ''}
${lead.expiryItems && lead.expiryItems.length > 0 ? `- ${lead.expiryItems.length} expiry items to monitor` : ''}
    `.trim()

    return NextResponse.json({ summary })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/ai/summary error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate summary' },
      { status: 500 }
    )
  }
}


















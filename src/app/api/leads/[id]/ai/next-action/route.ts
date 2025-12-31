import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/ai/next-action
// Suggest next best actions for the lead
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
          take: 5,
        },
        tasks: {
          where: { status: 'OPEN' },
        },
        expiryItems: {
          where: {
            expiryDate: {
              gte: new Date(),
            },
          },
          orderBy: { expiryDate: 'asc' },
          take: 1,
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // PHASE 5E: Check for quote follow-up tasks
    const { getNextQuoteFollowup } = await import('@/lib/followups/quoteFollowups')
    const quoteFollowup = await getNextQuoteFollowup(leadId)
    
    // Check if quotation was sent (using quotationSentAt or checking for quote-related tasks)
    const quotationSentAt = (lead as any).quotationSentAt
    const hasQuoteFollowups = quoteFollowup.task !== null

    // TODO: Implement actual AI next action generation
    // For now, return contextual suggestions
    const actions: string[] = []

    // PHASE 5E: Recommend quote follow-up if quote was sent and next follow-up is due soon
    if (quotationSentAt && hasQuoteFollowups && quoteFollowup.daysUntil !== null) {
      if (quoteFollowup.daysUntil <= 1) {
        actions.push(`Follow up on quote - next follow-up ${quoteFollowup.daysUntil === 0 ? 'due today' : 'due tomorrow'} (D+${quoteFollowup.task?.cadenceDays})`)
      } else if (quoteFollowup.daysUntil <= 3) {
        actions.push(`Follow up on quote - next follow-up in ${quoteFollowup.daysUntil} days (D+${quoteFollowup.task?.cadenceDays})`)
      }
    }

    if (!lead.nextFollowUpAt) {
      actions.push('Schedule a follow-up call or message')
    } else {
      const daysUntilFollowUp = Math.ceil(
        (new Date(lead.nextFollowUpAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilFollowUp <= 1) {
        actions.push(`Follow-up due ${daysUntilFollowUp === 0 ? 'today' : 'tomorrow'} - reach out now`)
      }
    }

    if (lead.messages && lead.messages.length === 0) {
      actions.push('Send initial contact message via WhatsApp')
    } else if (lead.messages && lead.messages.length > 0) {
      const lastMessage = lead.messages[0]
      if (lastMessage.direction === 'inbound') {
        actions.push('Respond to the latest message from the lead')
      }
    }

    if (lead.expiryItems && lead.expiryItems.length > 0) {
      const nextExpiry = lead.expiryItems[0]
      const daysUntilExpiry = Math.ceil(
        (new Date(nextExpiry.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilExpiry <= 30) {
        actions.push(`Renewal needed: ${nextExpiry.type} expires in ${daysUntilExpiry} days`)
      }
    }

    if (lead.tasks && lead.tasks.length === 0 && lead.stage !== 'COMPLETED_WON' && lead.stage !== 'LOST') {
      actions.push('Create a task to track next steps')
    }

    if (actions.length === 0) {
      actions.push('Continue nurturing the relationship with regular updates')
      actions.push('Check if all required documents have been collected')
    }

    return NextResponse.json({ actions: actions.slice(0, 3) })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/ai/next-action error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate next actions' },
      { status: 500 }
    )
  }
}



















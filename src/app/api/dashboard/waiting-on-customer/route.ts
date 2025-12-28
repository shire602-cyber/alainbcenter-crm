/**
 * WAITING ON CUSTOMER API
 * Returns leads where last message is outbound and customer hasn't replied
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { differenceInDays } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthApi()
    const now = new Date()

    const leads = await prisma.lead.findMany({
      where: {
        stage: {
          in: ['QUOTE_SENT', 'PROPOSAL_SENT', 'NEGOTIATION'],
        },
        lastOutboundAt: {
          not: null,
        },
        OR: [
          { assignedUserId: user.id },
          { assignedUserId: null },
        ],
      },
      include: {
        contact: true,
        conversations: {
          where: {
            status: 'open',
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastOutboundAt: 'desc' },
      take: 20,
    })

    const items = leads
      .filter(lead => {
        // Check if customer hasn't replied since last outbound
        if (!lead.lastOutboundAt) return false
        if (!lead.lastInboundAt) return true
        return lead.lastInboundAt < lead.lastOutboundAt
      })
      .map(lead => {
        const daysWaiting = lead.lastOutboundAt
          ? differenceInDays(now, lead.lastOutboundAt)
          : 0

        return {
          id: `waiting_${lead.id}`,
          leadId: lead.id,
          contactName: lead.contact.fullName,
          title: `Waiting on ${lead.contact.fullName}`,
          reason: `Quote sent ${daysWaiting} day${daysWaiting !== 1 ? 's' : ''} ago - awaiting response`,
          daysWaiting,
          revenuePotential: lead.expectedRevenueAED || undefined,
        }
      })

    return NextResponse.json({
      items,
      count: items.length,
    })
  } catch (error: any) {
    console.error('GET /api/dashboard/waiting-on-customer error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch waiting items' },
      { status: 500 }
    )
  }
}


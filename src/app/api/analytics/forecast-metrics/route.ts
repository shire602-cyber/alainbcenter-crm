import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// GET /api/analytics/forecast-metrics
// Returns forecast rollups: total expected revenue, pipeline by stage, at-risk leads
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // Get all active leads (not won/lost)
    const activeLeads = await prisma.lead.findMany({
      where: {
        stage: {
          notIn: ['COMPLETED_WON', 'LOST'],
        },
      },
      select: {
        id: true,
        stage: true,
        dealProbability: true,
        expectedRevenueAED: true,
        lastInboundAt: true,
        lastOutboundAt: true,
        lastContactAt: true,
        createdAt: true,
        contact: {
          select: {
            fullName: true,
            phone: true,
          },
        },
        serviceType: {
          select: {
            name: true,
          },
        },
      },
    })

    // Calculate total expected revenue
    const totalExpectedRevenue = activeLeads.reduce((sum, lead) => {
      return sum + (lead.expectedRevenueAED || 0)
    }, 0)

    // Pipeline by stage totals (expected revenue)
    const pipelineByStage = new Map<string, { count: number; expectedRevenue: number }>()
    
    activeLeads.forEach((lead) => {
      const stage = lead.stage || 'NEW'
      const current = pipelineByStage.get(stage) || { count: 0, expectedRevenue: 0 }
      pipelineByStage.set(stage, {
        count: current.count + 1,
        expectedRevenue: current.expectedRevenue + (lead.expectedRevenueAED || 0),
      })
    })

    // "At Risk" leads: high value (expectedRevenueAED > 10000) with low recent activity
    // Low activity = no inbound in last 7 days AND no outbound in last 3 days
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

    const atRiskLeads = activeLeads
      .filter((lead) => {
        const highValue = (lead.expectedRevenueAED || 0) >= 10000
        const noRecentInbound = !lead.lastInboundAt || lead.lastInboundAt < sevenDaysAgo
        const noRecentOutbound = !lead.lastOutboundAt || lead.lastOutboundAt < threeDaysAgo
        return highValue && (noRecentInbound || noRecentOutbound)
      })
      .sort((a, b) => (b.expectedRevenueAED || 0) - (a.expectedRevenueAED || 0))
      .slice(0, 10) // Top 10 at-risk leads
      .map((lead) => ({
        id: lead.id,
        contactName: lead.contact.fullName,
        phone: lead.contact.phone,
        serviceType: lead.serviceType?.name || 'Unknown',
        expectedRevenueAED: lead.expectedRevenueAED || 0,
        dealProbability: lead.dealProbability || 0,
        lastInboundAt: lead.lastInboundAt?.toISOString() || null,
        lastOutboundAt: lead.lastOutboundAt?.toISOString() || null,
        daysSinceLastActivity: lead.lastContactAt
          ? Math.floor((now.getTime() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }))

    // Convert pipeline map to array
    const pipelineArray = Array.from(pipelineByStage.entries()).map(([stage, data]) => ({
      stage,
      count: data.count,
      expectedRevenue: data.expectedRevenue,
    }))

    return NextResponse.json({
      ok: true,
      totalExpectedRevenue,
      pipelineByStage: pipelineArray,
      atRiskLeads,
      totalActiveLeads: activeLeads.length,
    })
  } catch (error: any) {
    console.error('GET /api/analytics/forecast-metrics error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch forecast metrics' },
      { status: error.statusCode || 500 }
    )
  }
}


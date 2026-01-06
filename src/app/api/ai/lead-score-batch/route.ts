/**
 * POST /api/ai/lead-score-batch
 * 
 * Batch score leads that need refresh:
 * - aiScore is null
 * - aiScore is older than 24h
 * - Has recent inbound message (last 2 hours)
 * 
 * Hard limit to protect Vercel (default: 10, max: 50)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { scoreAndPersistLead } from '@/lib/ai/leadScoring'
import { upsertAiTaskForLead } from '@/lib/automation/nextBestAction'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const body = await req.json()
    const limit = Math.min(Math.max(parseInt(body.limit || '10'), 1), 50) // Default 10, max 50

    // Find leads that need scoring refresh
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    // Get leads with recent inbound messages OR no aiScore
    // We prioritize leads with recent activity
    const leadsWithRecentInbound = await prisma.lead.findMany({
      where: {
        lastInboundAt: {
          gte: twoHoursAgo,
        },
        // Exclude won/lost leads
        NOT: {
          OR: [
            { stage: 'COMPLETED_WON' },
            { stage: 'LOST' },
            { status: 'won' },
            { status: 'lost' },
          ],
        },
      },
      select: {
        id: true,
        aiScore: true,
        lastInboundAt: true,
      },
      take: limit,
      orderBy: {
        lastInboundAt: 'desc',
      },
    })

    // Get leads with no aiScore (if we haven't hit the limit)
    const remainingLimit = limit - leadsWithRecentInbound.length
    const leadsWithoutScore = remainingLimit > 0 ? await prisma.lead.findMany({
      where: {
        aiScore: null,
        // Exclude won/lost leads
        NOT: {
          OR: [
            { stage: 'COMPLETED_WON' },
            { stage: 'LOST' },
            { status: 'won' },
            { status: 'lost' },
          ],
        },
      },
      select: {
        id: true,
        aiScore: true,
        lastInboundAt: true,
      },
      take: remainingLimit,
      orderBy: {
        createdAt: 'desc', // Prioritize newer leads
      },
    }) : []

    // Combine leads (recent inbound first, then no score)
    const leadsToScore = [
      ...leadsWithRecentInbound,
      ...leadsWithoutScore,
    ].slice(0, limit) // Apply hard limit

    console.log(`[API] Batch scoring ${leadsToScore.length} leads (limit: ${limit})`)

    const results = []
    const errors = []

    for (const lead of leadsToScore) {
      try {
        // Determine trigger based on recent activity
        const trigger = lead.lastInboundAt && new Date(lead.lastInboundAt) > twoHoursAgo
          ? 'inbound_message'
          : 'manual'

        // Score the lead
        const scoringResult = await scoreAndPersistLead(lead.id, trigger)

        // Get conversationId if available
        const conversation = await prisma.conversation.findFirst({
          where: { leadId: lead.id },
          orderBy: { lastMessageAt: 'desc' },
          select: { id: true },
        })

        // Create/update NBA task
        const taskResult = await upsertAiTaskForLead({
          leadId: lead.id,
          conversationId: conversation?.id,
          nba: scoringResult.nextBestAction,
        })

        results.push({
          leadId: lead.id,
          success: true,
          aiScore: scoringResult.aiScore,
          aiLabel: scoringResult.aiLabel,
          taskCreated: taskResult?.created || false,
          taskId: taskResult?.task.id,
        })
      } catch (error: any) {
        console.error(`[API] Error scoring lead ${lead.id}:`, error)
        errors.push({
          leadId: lead.id,
          error: error.message || 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: leadsToScore.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[API] Error in batch scoring:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to batch score leads',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}


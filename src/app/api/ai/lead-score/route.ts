/**
 * POST /api/ai/lead-score
 * 
 * Score a lead and create/update Next Best Action task
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
    const { leadId } = body

    if (!leadId || typeof leadId !== 'number') {
      return NextResponse.json(
        { error: 'leadId is required and must be a number' },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        stage: true,
        status: true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: `Lead ${leadId} not found` },
        { status: 404 }
      )
    }

    // Get trigger (default to 'manual' if not provided)
    const trigger = body.trigger || 'manual'

    // Score the lead
    console.log(`[API] Scoring lead ${leadId} (trigger: ${trigger})`)
    const scoringResult = await scoreAndPersistLead(leadId, trigger)

    // Get conversationId if available (most recent conversation for this lead)
    const conversation = await prisma.conversation.findFirst({
      where: { leadId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    })

    // Create/update NBA task
    const taskResult = await upsertAiTaskForLead({
      leadId,
      conversationId: conversation?.id,
      nba: scoringResult.nextBestAction,
    })

    // Fetch updated lead with scoring data
    const updatedLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        aiScore: true,
        aiNotes: true,
        stage: true,
        status: true,
      },
    })

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      scoring: {
        aiScore: scoringResult.aiScore,
        aiLabel: scoringResult.aiLabel,
        summary: scoringResult.summary,
        nextBestAction: scoringResult.nextBestAction,
      },
      task: taskResult ? {
        id: taskResult.task.id,
        title: taskResult.task.title,
        type: taskResult.task.type,
        dueAt: taskResult.task.dueAt,
        status: taskResult.task.status,
        created: taskResult.created,
      } : null,
    })
  } catch (error: any) {
    console.error('[API] Error scoring lead:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to score lead',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}


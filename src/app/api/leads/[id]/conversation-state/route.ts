import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { loadConversationState } from '@/lib/ai/stateMachine'

export async function GET(
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

    // Find the most recent conversation for this lead
    const conversation = await prisma.conversation.findFirst({
      where: { leadId },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      return NextResponse.json({
        knownFields: {},
      })
    }

    // Load conversation state (includes knownFields)
    const state = await loadConversationState(conversation.id)

    // Also check conversation.knownFields (legacy)
    const conversationKnownFields = conversation.knownFields
      ? (typeof conversation.knownFields === 'string' 
          ? JSON.parse(conversation.knownFields) 
          : conversation.knownFields)
      : {}

    // Merge state machine knownFields with conversation knownFields
    const mergedKnownFields = {
      ...conversationKnownFields,
      ...state.knownFields,
    }

    return NextResponse.json({
      knownFields: mergedKnownFields,
      qualificationStage: state.qualificationStage,
      questionsAskedCount: state.questionsAskedCount,
    })
  } catch (error: any) {
    console.error('Failed to load conversation state:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load conversation state' },
      { status: 500 }
    )
  }
}


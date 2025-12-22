import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { buildConversationContext } from '@/lib/ai/context'
import { generateNextActions } from '@/lib/ai/generate'

// POST /api/ai/next-actions
export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()
    const body = await req.json()

    const { conversationId } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    // Build context
    const contextSummary = await buildConversationContext(conversationId)

    // Generate next actions
    const result = await generateNextActions(contextSummary.structured)

    // Get lead and contact IDs
    const contact = await prisma.contact.findUnique({
      where: { id: conversationId },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    const leadId = contact?.leads[0]?.id || null
    const contactId = contact?.id || null

    // Log action
    await prisma.aIActionLog.create({
      data: {
        kind: 'next_actions',
        conversationId,
        leadId,
        contactId,
        ok: true,
        meta: JSON.stringify({
          actionCount: result.actions.length,
        }),
      },
    })

    return NextResponse.json({
      ok: true,
      actions: result.actions,
    })
  } catch (error: any) {
    console.error('POST /api/ai/next-actions error:', error)

    // Log failed action
    try {
      const body = await req.json().catch(() => ({}))
      await prisma.aIActionLog.create({
        data: {
          kind: 'next_actions',
          conversationId: body.conversationId || 0,
          ok: false,
          error: error.message || 'Unknown error',
        },
      })
    } catch (logError) {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate next actions' },
      { status: 500 }
    )
  }
}
























import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'

/**
 * POST /api/inbox/conversations/[id]/internal-note
 * Creates an internal note message
 * Requires authentication (staff allowed)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()

    const resolvedParams = await params
    const conversationId = parseInt(resolvedParams.id)

    if (isNaN(conversationId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid conversation ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { text } = body

    if (!text || !text.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Text is required' },
        { status: 400 }
      )
    }

    // Verify conversation exists
    // Use select instead of include for lead to avoid loading fields that may not exist yet
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        contactId: true,
        leadId: true,
        channel: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        lead: {
          select: {
            id: true,
            stage: true,
            serviceTypeId: true,
            // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json(
        { ok: false, error: 'Conversation not found' },
        { status: 404 }
      )
    }

    // Create internal message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: conversation.leadId,
        contactId: conversation.contactId,
        direction: 'internal',
        channel: conversation.channel,
        body: text.trim(),
        status: 'sent',
        createdByUserId: user.id,
      },
    })

    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        direction: message.direction,
        body: message.body,
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('POST /api/inbox/conversations/[id]/internal-note error:', error)

    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to create internal note' },
      { status: 500 }
    )
  }
}
/**
 * GET /api/leads/[id]/messages
 * 
 * Fetch messages for a lead, optionally filtered by channel
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

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
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Get optional channel filter from query params
    const searchParams = req.nextUrl.searchParams
    const channel = searchParams.get('channel')?.toLowerCase()

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Build where clause
    const where: any = {
      leadId,
    }

    if (channel) {
      // If channel specified, filter by channel
      where.channel = channel
    }

    // Fetch messages - PHASE 5A: Include BOTH inbound and outbound, with attachments
    const messages = await prisma.message.findMany({
      where,
      include: {
        conversation: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        statusEvents: {
          orderBy: {
            receivedAt: 'desc',
          },
          take: 1, // Get latest status
        },
        attachments: {
          select: {
            id: true,
            type: true,
            url: true,
            mimeType: true,
            filename: true,
            sizeBytes: true,
            thumbnailUrl: true,
            durationSec: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // Oldest first - chronological order
    })

    // Format response - PHASE 5A: Include all media fields
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      direction: msg.direction, // INBOUND | OUTBOUND
      channel: msg.channel,
      type: msg.type || 'text', // text | image | document | audio | video
      body: msg.body,
      mediaUrl: msg.mediaUrl,
      mediaMimeType: msg.mediaMimeType,
      providerMessageId: msg.providerMessageId, // WhatsApp message ID if any
      status: msg.status,
      sentAt: msg.sentAt,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
      createdBy: msg.createdByUser
        ? {
            id: msg.createdByUser.id,
            name: msg.createdByUser.name,
            email: msg.createdByUser.email,
          }
        : null,
      latestStatus: msg.statusEvents[0]
        ? {
            status: msg.statusEvents[0].status,
            providerStatus: msg.statusEvents[0].providerStatus,
            receivedAt: msg.statusEvents[0].receivedAt,
          }
        : null,
      // PHASE 5B: Include attachments
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        type: att.type,
        url: att.url,
        mimeType: att.mimeType,
        filename: att.filename,
        sizeBytes: att.sizeBytes,
        thumbnailUrl: att.thumbnailUrl,
        durationSec: att.durationSec,
        createdAt: att.createdAt,
      })),
    }))

    return NextResponse.json({
      ok: true,
      messages: formattedMessages,
      total: formattedMessages.length,
    })
  } catch (error: any) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



















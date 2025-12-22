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

    // Fetch messages
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
      },
      orderBy: {
        createdAt: 'asc', // Oldest first
      },
    })

    // Format response
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      direction: msg.direction,
      channel: msg.channel,
      type: msg.type,
      body: msg.body,
      mediaUrl: msg.mediaUrl,
      mediaMimeType: msg.mediaMimeType,
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



















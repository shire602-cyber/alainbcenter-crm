/**
 * GET /api/admin/leads/[id]/auto-reply-diagnosis
 * 
 * Diagnostic endpoint to check why auto-reply didn't work for a lead
 * Admin-only endpoint
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Get lead with all related data
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        conversations: {
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Get auto-reply logs for this lead
    const autoReplyLogs = await prisma.externalEventLog.findMany({
      where: {
        provider: 'auto-reply',
        payload: {
          contains: `"leadId":${leadId}`,
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    })

    // Parse logs
    const parsedLogs = autoReplyLogs.map(log => {
      try {
        const payload = JSON.parse(log.payload || '{}')
        return {
          id: log.id,
          receivedAt: log.receivedAt,
          status: payload.status,
          reason: payload.reason,
          error: payload.error,
          messageId: payload.messageId,
          isFirstMessage: payload.isFirstMessage,
          channel: payload.channel,
        }
      } catch (e) {
        return {
          id: log.id,
          receivedAt: log.receivedAt,
          raw: log.payload,
        }
      }
    })

    // Get webhook logs for this lead's contact
    const webhookLogs = await prisma.externalEventLog.findMany({
      where: {
        provider: 'whatsapp',
        payload: {
          contains: lead.contact?.phone || '',
        },
      },
      orderBy: { receivedAt: 'desc' },
      take: 10,
    })

    // Check message count for first message detection
    const inboundMessageCount = await prisma.message.count({
      where: {
        leadId: leadId,
        OR: [
          { direction: 'INBOUND' },
          { direction: 'inbound' },
          { direction: 'IN' },
        ],
        channel: 'whatsapp',
      },
    })

    // Check if there are any outbound messages (auto-replies)
    const outboundMessages = await prisma.message.findMany({
      where: {
        leadId: leadId,
        OR: [
          { direction: 'OUTBOUND' },
          { direction: 'outbound' },
          { direction: 'OUT' },
        ],
        channel: 'whatsapp',
        rawPayload: {
          contains: '"autoReply":true',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    return NextResponse.json({
      ok: true,
      lead: {
        id: lead.id,
        autoReplyEnabled: (lead as any).autoReplyEnabled,
        allowOutsideHours: (lead as any).allowOutsideHours,
        mutedUntil: (lead as any).mutedUntil,
        lastAutoReplyAt: (lead as any).lastAutoReplyAt,
        lastContactAt: lead.lastContactAt,
      },
      contact: {
        id: lead.contact?.id,
        phone: lead.contact?.phone,
        email: lead.contact?.email,
        fullName: lead.contact?.fullName,
      },
      messages: {
        total: lead.messages.length,
        inbound: inboundMessageCount,
        isFirstMessage: inboundMessageCount <= 1,
        latest: lead.messages.slice(0, 3).map(m => ({
          id: m.id,
          direction: m.direction,
          body: m.body?.substring(0, 100),
          channel: m.channel,
          createdAt: m.createdAt,
          providerMessageId: m.providerMessageId,
        })),
      },
      autoReplyLogs: parsedLogs,
      webhookLogs: webhookLogs.map(log => ({
        id: log.id,
        externalId: log.externalId,
        receivedAt: log.receivedAt,
      })),
      outboundAutoReplies: outboundMessages.map(m => ({
        id: m.id,
        body: m.body?.substring(0, 100),
        createdAt: m.createdAt,
        status: m.status,
        providerMessageId: m.providerMessageId,
      })),
      diagnosis: {
        hasContact: !!lead.contact,
        hasPhone: !!lead.contact?.phone,
        autoReplyEnabled: (lead as any).autoReplyEnabled !== false,
        isMuted: (lead as any).mutedUntil && new Date((lead as any).mutedUntil) > new Date(),
        hasInboundMessages: inboundMessageCount > 0,
        hasAutoReplyLogs: autoReplyLogs.length > 0,
        hasOutboundAutoReplies: outboundMessages.length > 0,
        lastAutoReplyAttempt: parsedLogs[0] || null,
      },
    })
  } catch (error: any) {
    console.error('Auto-reply diagnosis error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to diagnose' },
      { status: 500 }
    )
  }
}


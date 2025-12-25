/**
 * POST /api/admin/auto-reply/test
 * 
 * Test endpoint to manually trigger auto-reply for a lead
 * Admin-only endpoint for testing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { handleInboundAutoReply } from '@/lib/autoReply'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { leadId, messageText, channel = 'WHATSAPP' } = body

    if (!leadId || !messageText) {
      return NextResponse.json(
        { ok: false, error: 'leadId and messageText are required' },
        { status: 400 }
      )
    }

    // Get lead with contact
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(leadId) },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    if (!lead.contact) {
      return NextResponse.json(
        { ok: false, error: 'Lead has no contact' },
        { status: 400 }
      )
    }

    if (!lead.contact.phone) {
      return NextResponse.json(
        { ok: false, error: 'Contact has no phone number' },
        { status: 400 }
      )
    }

    // Get or create a test message
    const conversation = await prisma.conversation.findFirst({
      where: {
        leadId: lead.id,
        contactId: lead.contact.id,
        channel: channel.toLowerCase(),
      },
    })

    let messageId = lead.messages[0]?.id || 999999

    // Call auto-reply handler
    const result = await handleInboundAutoReply({
      leadId: lead.id,
      messageId: messageId,
      messageText: messageText,
      channel: channel,
      contactId: lead.contact.id,
    })

    return NextResponse.json({
      ok: true,
      result: {
        replied: result.replied,
        reason: result.reason,
        error: result.error,
      },
      lead: {
        id: lead.id,
        autoReplyEnabled: (lead as any).autoReplyEnabled,
        allowOutsideHours: (lead as any).allowOutsideHours,
      },
      contact: {
        id: lead.contact.id,
        phone: lead.contact.phone,
      },
    })
  } catch (error: any) {
    console.error('Test auto-reply error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to test auto-reply' },
      { status: 500 }
    )
  }
}


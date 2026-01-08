/**
 * POST /api/admin/auto-reply/test
 * 
 * Test endpoint to manually trigger auto-reply for a lead
 * Admin-only endpoint for testing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { generateReply } from '@/lib/replyEngine'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

export async function POST(req: NextRequest) {
  try {
    await requireAuthApi() // TODO: Add admin check if needed

    const body = await req.json()
    const { leadId, messageText, channel = 'WHATSAPP' } = body

    if (!leadId || !messageText) {
      return NextResponse.json(
        { ok: false, error: 'leadId and messageText are required' },
        { status: 400 }
      )
    }

    // Get lead with contact and conversation
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

    // Get or create conversation
    const normalizedChannel = channel.toLowerCase()
    let conversation
    try {
      conversation = await prisma.conversation.findFirst({
        where: {
          contactId: lead.contact.id,
          channel: normalizedChannel,
        },
        select: {
          id: true,
          contactId: true,
          leadId: true,
          channel: true,
          status: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          unreadCount: true,
          priorityScore: true,
          createdAt: true,
          updatedAt: true,
          aiState: true,
          aiLockUntil: true,
          lastAiOutboundAt: true,
          ruleEngineMemory: true,
          deletedAt: true,
        },
      }) as any
    } catch (error: any) {
      // Gracefully handle missing lastProcessedInboundMessageId column
      if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
        conversation = await prisma.conversation.findFirst({
          where: {
            contactId: lead.contact.id,
            channel: normalizedChannel,
          },
          select: {
            id: true,
            contactId: true,
            leadId: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            unreadCount: true,
            priorityScore: true,
            createdAt: true,
            updatedAt: true,
            aiState: true,
            aiLockUntil: true,
            lastAiOutboundAt: true,
            ruleEngineMemory: true,
            deletedAt: true,
          },
        }) as any
      } else {
        throw error
      }
    }

    if (!conversation) {
      // Create conversation if it doesn't exist
      conversation = await prisma.conversation.create({
        data: {
          contactId: lead.contact.id,
          leadId: lead.id,
          channel: normalizedChannel,
          status: 'open',
          lastMessageAt: new Date(),
        },
      })
    }

    // Create a test inbound message
    const testMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: lead.contact.id,
        direction: 'INBOUND',
        channel: normalizedChannel,
        type: 'text',
        body: messageText,
        status: 'RECEIVED',
      },
    })

    // Use new Reply Engine
    const contactName = lead.contact.fullName || 'there'
    const replyResult = await generateReply({
      conversationId: conversation.id,
      inboundMessageId: testMessage.id,
      inboundText: messageText,
      channel: normalizedChannel,
      useLLM: false, // Start with deterministic only
      contactName,
      language: 'en',
    })

    if (!replyResult) {
      return NextResponse.json({
        ok: false,
        error: 'Reply engine returned null',
      }, { status: 500 })
    }

    if (replyResult.debug.skipped) {
      return NextResponse.json({
        ok: true,
        result: {
          replied: false,
          reason: replyResult.debug.reason || 'Reply skipped',
        },
        lead: {
          id: lead.id,
        },
        contact: {
          id: lead.contact.id,
          phone: lead.contact.phone,
        },
      })
    }

    // Send the reply via WhatsApp with idempotency
    let sendResult: any = null
    let sendError: string | null = null

    if (replyResult.text && replyResult.text.trim().length > 0) {
      try {
        sendResult = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: lead.contact.id,
          leadId: lead.id,
          phone: lead.contact.phone,
          text: replyResult.text,
          provider: 'whatsapp',
          triggerProviderMessageId: testMessage.providerMessageId || null,
          replyType: 'answer',
          lastQuestionKey: null,
          flowStep: null,
        })

        if (sendResult.wasDuplicate) {
          console.log(`⚠️ [TEST] Duplicate outbound blocked by idempotency`)
          sendError = 'Duplicate message blocked (idempotency)'
        } else if (!sendResult.success) {
          throw new Error(sendResult.error || 'Failed to send message')
        }

        // Create outbound message record (if not already created by idempotency system)
        try {
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              leadId: lead.id,
              contactId: lead.contact.id,
              direction: 'OUTBOUND',
              channel: normalizedChannel,
              type: 'text',
              body: replyResult.text,
              providerMessageId: sendResult.messageId || null,
              status: sendResult.success ? 'SENT' : 'FAILED',
              sentAt: new Date(),
            },
          })
        } catch (msgError: any) {
          // Non-critical - message may already exist
          if (!msgError.message?.includes('Unique constraint')) {
            console.warn(`⚠️ [TEST] Failed to create Message record:`, msgError.message)
          }
        }
      } catch (error: any) {
        sendError = error.message
        console.error('Failed to send WhatsApp message:', error)
      }
    }

    return NextResponse.json({
      ok: true,
      result: {
        replied: !!sendResult,
        reason: sendError || (sendResult ? 'Reply sent successfully' : 'No reply text generated'),
        error: sendError || undefined,
        replyText: replyResult.text,
        templateKey: replyResult.debug.templateKey,
        action: replyResult.debug.plan.action,
      },
      lead: {
        id: lead.id,
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


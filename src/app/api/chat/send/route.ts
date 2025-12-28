import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/messaging'

export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()
    const body = await req.json()
    const { contactId, message, channel = 'whatsapp' } = body

    if (!contactId || !message) {
      return NextResponse.json(
        { error: 'Contact ID and message are required' },
        { status: 400 }
      )
    }

    // Get contact and their latest lead
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const lead = contact.leads[0] || null

    // STEP 2 FIX: Use Message table instead of ChatMessage
    // Use canonical upsertConversation
    const { upsertConversation } = await import('@/lib/conversation/upsert')
    const { getExternalThreadId } = await import('@/lib/conversation/getExternalThreadId')
    
    const { id: conversationId } = await upsertConversation({
      contactId: contact.id,
      channel: channel.toLowerCase(),
      leadId: lead?.id || null,
      externalThreadId: getExternalThreadId(channel.toLowerCase(), contact),
    })
    
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    })
    
    if (!conversation) {
      throw new Error(`Failed to fetch conversation ${conversationId} after upsert`)
    }

    // Create Message record (replaces ChatMessage)
    const messageRecord = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        contactId: contact.id,
        leadId: lead?.id || null,
        direction: 'OUTBOUND',
        channel: channel.toUpperCase(),
        type: 'text',
        body: message,
        status: 'SENT',
        sentAt: new Date(),
      },
    })

    // Try to send via integration if enabled
    if (lead && channel === 'whatsapp') {
      try {
        await sendWhatsApp(lead, contact, message)
      } catch (error) {
        console.error('Failed to send WhatsApp message:', error)
        // Update message status to failed
        await prisma.message.update({
          where: { id: messageRecord.id },
          data: { status: 'FAILED' },
        })
      }
    }

    return NextResponse.json({
      id: messageRecord.id,
      message: messageRecord.body,
      createdAt: messageRecord.createdAt,
      direction: messageRecord.direction,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: error.statusCode || 500 }
    )
  }
}


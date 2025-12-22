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

    // Create chat message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        contactId,
        leadId: lead?.id || null,
        channel,
        direction: 'outbound',
        message,
      },
    })

    // Try to send via integration if enabled
    if (lead && channel === 'whatsapp') {
      try {
        await sendWhatsApp(lead, contact, message)
      } catch (error) {
        console.error('Failed to send WhatsApp message:', error)
        // Message is still saved in chat
      }
    }

    return NextResponse.json(chatMessage)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: error.statusCode || 500 }
    )
  }
}


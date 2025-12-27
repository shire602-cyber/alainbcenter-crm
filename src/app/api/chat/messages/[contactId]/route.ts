import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    await requireAuthApi()
    
    // Resolve params (Next.js 15+ can have Promise params)
    const resolvedParams = await params
    const contactId = parseInt(resolvedParams.contactId)
    const markRead = req.nextUrl.searchParams.get('markRead') === 'true'

    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 })
    }

    // STEP 2 FIX: Use Message table instead of ChatMessage
    // Find conversation for this contact (default to whatsapp channel)
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId,
        channel: 'whatsapp', // Default channel
      },
    })

    if (!conversation) {
      return NextResponse.json([])
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    })

    // Mark messages as read if requested
    // Update readAt timestamp for inbound messages
    if (markRead) {
      await prisma.message.updateMany({
        where: {
          conversationId: conversation.id,
          direction: { in: ['INBOUND', 'IN'] },
        },
        data: {
          readAt: new Date(), // Mark as read by setting readAt timestamp
        },
      })
      
      // Update conversation unread count
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: 0 },
      })
    }

    // Format messages for frontend compatibility
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      message: msg.body || '',
      direction: msg.direction.toLowerCase(),
      channel: msg.channel.toLowerCase(),
      createdAt: msg.createdAt.toISOString(),
      readAt: null, // Message table doesn't have readAt
      leadId: msg.leadId,
      contactId: msg.contactId,
    }))

    return NextResponse.json(formattedMessages)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load messages' },
      { status: error.statusCode || 500 }
    )
  }
}


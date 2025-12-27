import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // STEP 2 FIX: Use Conversation and Message tables instead of ChatMessage
    // Get all conversations with their latest message
    const conversations = await prisma.conversation.findMany({
      include: {
        contact: true,
        lead: {
          select: {
            id: true,
            stage: true,
            aiScore: true,
            nextFollowUpAt: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    // Format conversations for frontend
    const formattedConversations = conversations.map((conv) => {
      const lastMessage = conv.messages[0]
      
      // Count unread inbound messages
      const unreadCount = lastMessage && 
        (lastMessage.direction === 'INBOUND' || lastMessage.direction === 'IN') &&
        !lastMessage.readAt ? 1 : 0

      return {
        contact: conv.contact,
        lead: conv.lead,
        lastMessage: lastMessage ? {
          id: lastMessage.id,
          message: lastMessage.body || '',
          createdAt: lastMessage.createdAt,
        } : undefined,
        unreadCount,
      }
    })

    return NextResponse.json(formattedConversations)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load conversations' },
      { status: error.statusCode || 500 }
    )
  }
}


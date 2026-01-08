import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // STEP 2 FIX: Use Conversation and Message tables instead of ChatMessage
    // Get all conversations with their latest message
    let conversations
    try {
      conversations = await prisma.conversation.findMany({
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
    } catch (error: any) {
      // Gracefully handle missing lastProcessedInboundMessageId column
      if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
        console.warn('[DB] lastProcessedInboundMessageId column not found, querying with select (this is OK if migration not yet applied)')
        // Use select to explicitly exclude the problematic column
        conversations = await prisma.conversation.findMany({
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
              select: {
                id: true,
                direction: true,
                body: true,
                createdAt: true,
                readAt: true,
              },
            },
          },
          orderBy: { lastMessageAt: 'desc' },
        }) as any
      } else {
        throw error
      }
    }

    // Format conversations for frontend
    const formattedConversations = conversations.map((conv: any) => {
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


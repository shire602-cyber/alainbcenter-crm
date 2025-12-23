import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // Get all contacts who have chat messages
    const messages = await prisma.chatMessage.findMany({
      include: {
        contact: true,
        lead: {
          select: {
            id: true,
            stage: true,
            aiScore: true,
            nextFollowUpAt: true,
            // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group by contact and get latest message
    const conversationsMap = new Map<number, {
      contact: any
      lastMessage?: any
      unreadCount: number
    }>()

    messages.forEach((msg) => {
      if (!msg.contactId || !msg.contact) return

      const contactId = msg.contactId
      if (!conversationsMap.has(contactId)) {
        conversationsMap.set(contactId, {
          contact: msg.contact,
          unreadCount: 0,
        })
      }

      const conv = conversationsMap.get(contactId)!
      
      // Set last message if not set or this is newer
      if (!conv.lastMessage || new Date(msg.createdAt) > new Date(conv.lastMessage.createdAt)) {
        conv.lastMessage = {
          id: msg.id,
          message: msg.message,
          createdAt: msg.createdAt,
        }
      }

      // Count unread messages
      if (msg.direction === 'inbound' && !msg.readAt) {
        conv.unreadCount++
      }
    })

    // Convert to array and sort by last message time
    const conversations = Array.from(conversationsMap.values()).sort((a, b) => {
      if (!a.lastMessage) return 1
      if (!b.lastMessage) return -1
      return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    })

    return NextResponse.json(conversations)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load conversations' },
      { status: error.statusCode || 500 }
    )
  }
}


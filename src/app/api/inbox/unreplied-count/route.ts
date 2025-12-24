import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/inbox/unreplied-count
 * Returns the count of conversations with unreplied messages
 */
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ count: 0 }, { status: 200 })
    }

    // Count conversations that need a reply
    // A conversation needs a reply if:
    // 1. Has unread inbound messages (unreadCount > 0)
    // 2. Has needsReplySince set (customer sent a message that hasn't been replied to)
    // 3. Last message is inbound and no outbound message was sent after it
    
    const unrepliedCount = await prisma.conversation.count({
      where: {
        OR: [
          { unreadCount: { gt: 0 } },
          { needsReplySince: { not: null } },
        ],
      },
    })

    return NextResponse.json({ 
      count: unrepliedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error fetching unreplied count:', error)
    return NextResponse.json({ 
      count: 0,
      error: error.message 
    }, { status: 500 })
  }
}


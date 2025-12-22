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

    const messages = await prisma.chatMessage.findMany({
      where: { contactId },
      orderBy: { createdAt: 'asc' },
    })

    // Mark messages as read if requested
    if (markRead) {
      await prisma.chatMessage.updateMany({
        where: {
          contactId,
          direction: 'inbound',
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      })
    }

    return NextResponse.json(messages)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load messages' },
      { status: error.statusCode || 500 }
    )
  }
}


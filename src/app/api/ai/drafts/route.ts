import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// GET /api/ai/drafts?conversationId=123
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      )
    }

    const drafts = await prisma.aIDraft.findMany({
      where: { conversationId: parseInt(conversationId) },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    return NextResponse.json(drafts)
  } catch (error: any) {
    console.error('GET /api/ai/drafts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch drafts' },
      { status: 500 }
    )
  }
}























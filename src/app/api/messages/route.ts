import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'

// GET /api/messages
// List messages with optional filters
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const conversationId = searchParams.get('conversationId')
    const leadId = searchParams.get('leadId')
    const limit = searchParams.get('limit')
    
    const where: any = {}
    
    if (status) {
      where.status = status
    }
    
    if (conversationId) {
      where.conversationId = parseInt(conversationId)
    }
    
    if (leadId) {
      where.leadId = parseInt(leadId)
    }
    
    const messages = await prisma.message.findMany({
      where,
      include: {
        conversation: {
          include: {
            contact: {
              select: { id: true, fullName: true, phone: true }
            }
          }
        },
        lead: {
          select: { id: true, stage: true, priority: true }
        },
        createdByUser: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit ? parseInt(limit) : undefined
    })
    
    return NextResponse.json(messages)
  } catch (error: any) {
    console.error('GET /api/messages error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in GET /api/messages' },
      { status: error.statusCode || 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminApi } from '@/lib/authApi'

export const runtime = 'nodejs'

/**
 * GET /api/admin/reply-engine-logs
 * Fetch ReplyEngineLogs for admin debugging
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi() // Ensures user is authenticated and is ADMIN

    const { searchParams } = new URL(req.url)
    const conversationId = searchParams.get('conversationId')
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }

    // Check if ReplyEngineLog table exists
    try {
      const logs = await (prisma as any).replyEngineLog.findMany({
        where: {
          conversationId: parseInt(conversationId, 10),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        select: {
          id: true,
          action: true,
          templateKey: true,
          questionKey: true,
          reason: true,
          extractedFields: true,
          replyKey: true,
          replyText: true,
          createdAt: true,
        },
      })

      return NextResponse.json({
        ok: true,
        logs: logs.map((log: any) => ({
          ...log,
          extractedFields: log.extractedFields ? JSON.parse(log.extractedFields) : null,
        })),
      })
    } catch (error: any) {
      // Table might not exist yet
      if (error.code === 'P2001' || error.message?.includes('does not exist')) {
        return NextResponse.json({
          ok: true,
          logs: [],
          message: 'ReplyEngineLog table not found (migration pending)',
        })
      }
      throw error
    }
  } catch (error: any) {
    console.error('Failed to fetch reply engine logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logs', details: error.message },
      { status: 500 }
    )
  }
}


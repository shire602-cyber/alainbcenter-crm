import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// GET /api/admin/automation/run-logs
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '20')

    const logs = await prisma.sentAutomation.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        rule: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
        lead: {
          select: {
            id: true,
          },
        },
      },
    })

    // Transform to match expected format
    const transformedLogs = logs.map(log => ({
      id: log.id,
      ruleKey: log.rule.type,
      ruleName: log.rule.name,
      leadId: log.leadId,
      status: 'sent',
      reason: null,
      message: null,
      createdAt: log.createdAt,
    }))

    return NextResponse.json(transformedLogs)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch run logs' },
      { status: error.statusCode || 500 }
    )
  }
}























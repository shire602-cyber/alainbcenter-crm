/**
 * GET /api/automation/logs
 * 
 * Fetch automation run logs with optional filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('leadId')
    const ruleId = searchParams.get('ruleId')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: any = {}
    if (leadId) where.leadId = parseInt(leadId)
    if (ruleId) where.ruleId = parseInt(ruleId)
    if (status) where.status = status.toUpperCase()

    const logs = await prisma.automationRunLog.findMany({
      where,
      include: {
        rule: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        lead: {
          select: {
            id: true,
            contact: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
      orderBy: { ranAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      ok: true,
      logs,
    })
  } catch (error: any) {
    console.error('Error fetching automation logs:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

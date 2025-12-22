import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()
    const rules = await prisma.automationRule.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(rules)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rules' },
      { status: error.statusCode || 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()
    const body = await req.json()
    const { name, type, channel, daysBeforeExpiry, followupAfterDays } = body

    if (!name || !type || !channel) {
      return NextResponse.json(
        { error: 'Name, type, and channel are required' },
        { status: 400 }
      )
    }

    if (type === 'expiry_reminder' && (daysBeforeExpiry == null || typeof daysBeforeExpiry !== 'number')) {
      return NextResponse.json(
        { error: 'daysBeforeExpiry is required and must be a number for expiry_reminder rules' },
        { status: 400 }
      )
    }

    if (type === 'followup_due' && (followupAfterDays == null || typeof followupAfterDays !== 'number')) {
      return NextResponse.json(
        { error: 'followupAfterDays is required and must be a number for followup_due rules' },
        { status: 400 }
      )
    }

    const rule = await prisma.automationRule.create({
      data: {
        name,
        type,
        channel,
        daysBeforeExpiry: type === 'expiry_reminder' ? daysBeforeExpiry : null,
        followupAfterDays: type === 'followup_due' ? followupAfterDays : null,
      },
    })

    return NextResponse.json(rule)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create rule' },
      { status: error.statusCode || 500 }
    )
  }
}


/**
 * GET /api/automation/rules - List all automation rules
 * POST /api/automation/rules - Create new automation rule
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const rules = await prisma.automationRule.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      ok: true,
      rules: rules.map(rule => ({
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : null,
        actions: rule.actions ? JSON.parse(rule.actions) : null,
      })),
    })
  } catch (error: any) {
    console.error('Error fetching automation rules:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    const {
      name,
      description,
      trigger,
      conditions,
      actions,
      schedule,
      isActive,
      enabled,
      key,
    } = body

    if (!name || !trigger) {
      return NextResponse.json(
        { ok: false, error: 'Name and trigger are required' },
        { status: 400 }
      )
    }

    const rule = await prisma.automationRule.create({
      data: {
        name,
        trigger,
        conditions: conditions ? JSON.stringify(conditions) : null,
        actions: actions ? JSON.stringify(actions) : null,
        schedule: schedule || 'daily',
        isActive: isActive !== false,
        enabled: enabled !== false,
        key: key || null,
        template: null, // Legacy field
      },
    })

    return NextResponse.json({
      ok: true,
      rule: {
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : null,
        actions: rule.actions ? JSON.parse(rule.actions) : null,
      },
    })
  } catch (error: any) {
    console.error('Error creating automation rule:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}














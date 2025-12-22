/**
 * GET /api/automation/rules/[id] - Get rule details
 * PATCH /api/automation/rules/[id] - Update rule
 * DELETE /api/automation/rules/[id] - Delete rule
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const ruleId = parseInt(resolvedParams.id)

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid rule ID' },
        { status: 400 }
      )
    }

    const rule = await prisma.automationRule.findUnique({
      where: { id: ruleId },
      include: {
        runLogs: {
          orderBy: { ranAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!rule) {
      return NextResponse.json(
        { ok: false, error: 'Rule not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      rule: {
        ...rule,
        conditions: rule.conditions ? JSON.parse(rule.conditions) : null,
        actions: rule.actions ? JSON.parse(rule.actions) : null,
      },
    })
  } catch (error: any) {
    console.error('Error fetching automation rule:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const ruleId = parseInt(resolvedParams.id)

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid rule ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const updateData: any = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.trigger !== undefined) updateData.trigger = body.trigger
    if (body.conditions !== undefined) {
      updateData.conditions = typeof body.conditions === 'string'
        ? body.conditions
        : JSON.stringify(body.conditions)
    }
    if (body.actions !== undefined) {
      updateData.actions = typeof body.actions === 'string'
        ? body.actions
        : JSON.stringify(body.actions)
    }
    if (body.schedule !== undefined) updateData.schedule = body.schedule
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.enabled !== undefined) updateData.enabled = body.enabled

    const rule = await prisma.automationRule.update({
      where: { id: ruleId },
      data: updateData,
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
    if (error.code === 'P2025') {
      return NextResponse.json(
        { ok: false, error: 'Rule not found' },
        { status: 404 }
      )
    }
    console.error('Error updating automation rule:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const ruleId = parseInt(resolvedParams.id)

    if (isNaN(ruleId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid rule ID' },
        { status: 400 }
      )
    }

    await prisma.automationRule.delete({
      where: { id: ruleId },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { ok: false, error: 'Rule not found' },
        { status: 404 }
      )
    }
    console.error('Error deleting automation rule:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


















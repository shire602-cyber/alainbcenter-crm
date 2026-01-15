import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    await requireAdmin()
    const config = await prisma.serviceRoutingConfig.findUnique({
      where: { workspaceId: 1 },
    })
    return NextResponse.json({
      ok: true,
      mapping: config?.mapping ? JSON.parse(config.mapping) : {},
      lastAssignedIndex: config?.lastAssignedIndex
        ? JSON.parse(config.lastAssignedIndex)
        : {},
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load routing config' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const body = await req.json()
    const mapping = body?.mapping || body

    if (!mapping || typeof mapping !== 'object') {
      return NextResponse.json(
        { ok: false, error: 'Invalid mapping payload' },
        { status: 400 }
      )
    }

    const config = await prisma.serviceRoutingConfig.upsert({
      where: { workspaceId: 1 },
      update: {
        mapping: JSON.stringify(mapping),
      },
      create: {
        workspaceId: 1,
        mapping: JSON.stringify(mapping),
        lastAssignedIndex: JSON.stringify({}),
      },
    })

    return NextResponse.json({ ok: true, config })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to save routing config' },
      { status: 500 }
    )
  }
}

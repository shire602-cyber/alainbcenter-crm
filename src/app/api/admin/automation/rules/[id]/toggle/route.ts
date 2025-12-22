import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()
    
    // Resolve params (Next.js 15+ params are always Promise)
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    const rule = await prisma.automationRule.findUnique({ where: { id } })
    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 })
    }

    const updated = await prisma.automationRule.update({
      where: { id },
      data: { isActive: !rule.isActive },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to toggle rule' },
      { status: error.statusCode || 500 }
    )
  }
}


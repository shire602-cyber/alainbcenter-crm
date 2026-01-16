import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const adAccountId = typeof body?.selectedAdAccountId === 'string' ? body.selectedAdAccountId.trim() : ''
    const formIdsInput = Array.isArray(body?.selectedFormIds) ? body.selectedFormIds : []
    const formIds = formIdsInput
      .map((id: string) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id: string) => id.length > 0)

    if (!adAccountId) {
      return NextResponse.json({ ok: false, error: 'selectedAdAccountId is required' }, { status: 400 })
    }

    await prisma.metaLeadgenState.upsert({
      where: { workspaceId: 1 },
      update: {
        selectedAdAccountId: adAccountId,
        selectedFormIds: JSON.stringify(formIds),
      },
      create: {
        workspaceId: 1,
        selectedAdAccountId: adAccountId,
        selectedFormIds: JSON.stringify(formIds),
      },
    })

    return NextResponse.json({
      ok: true,
      selectedAdAccountId: adAccountId,
      selectedFormIds: formIds,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to save leadgen config' },
      { status: error.statusCode || 500 }
    )
  }
}

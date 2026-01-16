import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const adAccountId = typeof body?.selectedAdAccountId === 'string' ? body.selectedAdAccountId.trim() : ''
    const adAccountIdsInput = Array.isArray(body?.selectedAdAccountIds) ? body.selectedAdAccountIds : []
    const adAccountIds = adAccountIdsInput
      .map((id: string) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id: string) => id.length > 0)
    const formIdsInput = Array.isArray(body?.selectedFormIds) ? body.selectedFormIds : []
    const formIds = formIdsInput
      .map((id: string) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id: string) => id.length > 0)

    const adAccounts = adAccountIds.length > 0
      ? adAccountIds
      : (adAccountId ? [adAccountId] : [])

    if (adAccounts.length === 0) {
      return NextResponse.json({ ok: false, error: 'selectedAdAccountId is required' }, { status: 400 })
    }

    await prisma.metaLeadgenState.upsert({
      where: { workspaceId: 1 },
      update: {
        selectedAdAccountId: JSON.stringify(adAccounts),
        selectedFormIds: JSON.stringify(formIds),
      },
      create: {
        workspaceId: 1,
        selectedAdAccountId: JSON.stringify(adAccounts),
        selectedFormIds: JSON.stringify(formIds),
      },
    })

    return NextResponse.json({
      ok: true,
      selectedAdAccountIds: adAccounts,
      selectedFormIds: formIds,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to save leadgen config' },
      { status: error.statusCode || 500 }
    )
  }
}

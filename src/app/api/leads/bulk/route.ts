import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi, requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/leads/bulk
 * Bulk actions on leads: change stage, assign owner, delete
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const body = await req.json()
    const { action, leadIds, data } = body

    if (!action || !leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json(
        { error: 'action and leadIds array are required' },
        { status: 400 }
      )
    }

    const ids = leadIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'No valid lead IDs provided' },
        { status: 400 }
      )
    }

    let updated = 0
    let errors: string[] = []

    switch (action) {
      case 'change-stage':
        if (!data?.pipelineStage) {
          return NextResponse.json(
            { error: 'pipelineStage is required for change-stage action' },
            { status: 400 }
          )
        }
        try {
          await prisma.lead.updateMany({
            where: { id: { in: ids } },
            data: { pipelineStage: data.pipelineStage },
          })
          updated = ids.length
        } catch (error: any) {
          errors.push(error.message)
        }
        break

      case 'assign-owner':
        const assignedUserId = data?.assignedUserId ? parseInt(data.assignedUserId) : null
        try {
          await prisma.lead.updateMany({
            where: { id: { in: ids } },
            data: {
              assignedUserId: assignedUserId && !isNaN(assignedUserId) ? assignedUserId : null,
            },
          })
          updated = ids.length
        } catch (error: any) {
          errors.push(error.message)
        }
        break

      case 'delete':
        // Only admin can delete
        await requireAdminApi()
        try {
          await prisma.lead.deleteMany({
            where: { id: { in: ids } },
          })
          updated = ids.length
        } catch (error: any) {
          errors.push(error.message)
        }
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    return NextResponse.json({
      ok: true,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('POST /api/leads/bulk error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to perform bulk action' },
      { status: 500 }
    )
  }
}


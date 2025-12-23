import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/admin/ai-training/documents/[id]
 * Delete an AI training document
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)

    if (isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid document ID' },
        { status: 400 }
      )
    }

    await prisma.aITrainingDocument.delete({
      where: { id },
    })

    return NextResponse.json({
      ok: true,
    })
  } catch (error: any) {
    console.error('DELETE /api/admin/ai-training/documents/[id] error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete document' },
      { status: 500 }
    )
  }
}


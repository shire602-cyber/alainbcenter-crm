import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrManagerApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdminOrManagerApi()

    const [renewalItemCount, expiryItemCount] = await Promise.all([
      prisma.renewalItem.count(),
      prisma.expiryItem.count(),
    ])

    return NextResponse.json({
      ok: true,
      renewalItemCount,
      expiryItemCount,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load renewals status' },
      { status: error.statusCode || 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    await requireAdminApi()
    
    const resolvedParams = await params
    const integration = await prisma.integration.findUnique({
      where: { name: resolvedParams.name },
    })

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      )
    }

    const updated = await prisma.integration.update({
      where: { name: resolvedParams.name },
      data: { isEnabled: !integration.isEnabled },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to toggle integration' },
      { status: error.statusCode || 500 }
    )
  }
}




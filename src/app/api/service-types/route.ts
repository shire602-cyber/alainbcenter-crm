import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/service-types - Get active service types for forms
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const includeInactive = searchParams.get('includeInactive') === 'true'

    const services = await prisma.serviceType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(services)
  } catch (error: any) {
    console.error('GET /api/service-types error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}


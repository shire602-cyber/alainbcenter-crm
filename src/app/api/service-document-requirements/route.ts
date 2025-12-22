/**
 * GET /api/service-document-requirements - List document requirements by service
 * POST /api/service-document-requirements - Create document requirement
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const { searchParams } = new URL(req.url)
    const serviceType = searchParams.get('serviceType')

    const where: any = {}
    if (serviceType) {
      where.serviceType = serviceType
    }

    const requirements = await prisma.serviceDocumentRequirement.findMany({
      where,
      orderBy: [
        { serviceType: 'asc' },
        { order: 'asc' },
      ],
    })

    return NextResponse.json({
      ok: true,
      requirements,
    })
  } catch (error: any) {
    console.error('Error fetching document requirements:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const body = await req.json()
    const { serviceType, documentType, label, isMandatory, order, description } = body

    if (!serviceType || !documentType || !label) {
      return NextResponse.json(
        { ok: false, error: 'serviceType, documentType, and label are required' },
        { status: 400 }
      )
    }

    const requirement = await prisma.serviceDocumentRequirement.create({
      data: {
        serviceType,
        documentType,
        label,
        isMandatory: isMandatory !== false,
        order: order || 0,
        description: description || null,
      },
    })

    return NextResponse.json({
      ok: true,
      requirement,
    })
  } catch (error: any) {
    console.error('Error creating document requirement:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


















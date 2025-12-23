import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/ai-training/documents
 * List all AI training documents
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const documents = await prisma.aITrainingDocument.findMany({
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json({
      ok: true,
      documents,
    })
  } catch (error: any) {
    console.error('GET /api/admin/ai-training/documents error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to load documents' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/ai-training/documents
 * Create a new AI training document
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminApi()

    const body = await req.json()
    const { title, content, type } = body

    if (!title || !content || !type) {
      return NextResponse.json(
        { ok: false, error: 'Title, content, and type are required' },
        { status: 400 }
      )
    }

    const document = await prisma.aITrainingDocument.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        type,
        createdByUserId: user.id,
      },
    })

    return NextResponse.json({
      ok: true,
      document,
    })
  } catch (error: any) {
    console.error('POST /api/admin/ai-training/documents error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to create document' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/ai-training/documents
 * Update an existing AI training document
 */
export async function PUT(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { id, title, content, type } = body

    if (!id || !title || !content || !type) {
      return NextResponse.json(
        { ok: false, error: 'ID, title, content, and type are required' },
        { status: 400 }
      )
    }

    const document = await prisma.aITrainingDocument.update({
      where: { id: parseInt(id) },
      data: {
        title: title.trim(),
        content: content.trim(),
        type,
      },
    })

    return NextResponse.json({
      ok: true,
      document,
    })
  } catch (error: any) {
    console.error('PUT /api/admin/ai-training/documents error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update document' },
      { status: 500 }
    )
  }
}


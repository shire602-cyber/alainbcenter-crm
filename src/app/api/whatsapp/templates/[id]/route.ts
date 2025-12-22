import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/whatsapp/templates/[id]
 * Update template (e.g., approve, reject, edit)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const templateId = parseInt(resolvedParams.id)
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
    }

    const body = await req.json()
    const { status, body: templateBody, language } = body

    try {
      const updateData: any = {}
      if (status !== undefined) {
        if (!['draft', 'approved'].includes(status)) {
          return NextResponse.json(
            { error: 'Invalid status. Must be: draft or approved' },
            { status: 400 }
          )
        }
        updateData.status = status
      }
      if (templateBody !== undefined) {
        updateData.body = templateBody
      }
      if (language !== undefined) {
        updateData.language = language
      }

      const template = await (prisma as any).whatsAppTemplate?.update({
        where: { id: templateId },
        data: updateData,
      })

      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        )
      }

      return NextResponse.json(template)
    } catch (modelError: any) {
      if (
        modelError.message?.includes('whatsAppTemplate') ||
        modelError.message?.includes('does not exist')
      ) {
        return NextResponse.json(
          { error: 'WhatsApp templates feature not available' },
          { status: 503 }
        )
      }
      throw modelError
    }
  } catch (error: any) {
    console.error('PATCH /api/whatsapp/templates/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update template' },
      { status: error.statusCode || 500 }
    )
  }
}

/**
 * DELETE /api/whatsapp/templates/[id]
 * Delete a template
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const resolvedParams = await params
    const templateId = parseInt(resolvedParams.id)
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 })
    }

    try {
      await (prisma as any).whatsAppTemplate?.delete({
        where: { id: templateId },
      })

      return NextResponse.json({ success: true })
    } catch (modelError: any) {
      if (
        modelError.message?.includes('whatsAppTemplate') ||
        modelError.message?.includes('does not exist')
      ) {
        return NextResponse.json(
          { error: 'WhatsApp templates feature not available' },
          { status: 503 }
        )
      }
      if (modelError.code === 'P2025') {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      throw modelError
    }
  } catch (error: any) {
    console.error('DELETE /api/whatsapp/templates/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete template' },
      { status: error.statusCode || 500 }
    )
  }
}

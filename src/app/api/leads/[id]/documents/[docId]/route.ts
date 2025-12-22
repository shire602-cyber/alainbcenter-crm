/**
 * PATCH /api/leads/[id]/documents/[docId]
 * Update document metadata (label, expiryDate, notes)
 * 
 * DELETE /api/leads/[id]/documents/[docId]
 * Delete a document
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    const docId = parseInt(resolvedParams.docId)

    if (isNaN(leadId) || isNaN(docId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID or document ID' },
        { status: 400 }
      )
    }

    // Get document and verify ownership
    const document = await prisma.document.findUnique({
      where: { id: docId },
    })

    if (!document || document.leadId !== leadId) {
      return NextResponse.json(
        { ok: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    const body = await req.json()
    const updateData: any = {}

    // Update category (document type)
    if (body.category !== undefined) {
      updateData.category = body.category
    }

    // Update expiry date
    if (body.expiryDate !== undefined) {
      if (body.expiryDate === null || body.expiryDate === '') {
        updateData.expiryDate = null
      } else {
        const expiryDate = new Date(body.expiryDate)
        if (isNaN(expiryDate.getTime())) {
          return NextResponse.json(
            { ok: false, error: 'Invalid expiry date format' },
            { status: 400 }
          )
        }
        updateData.expiryDate = expiryDate
      }
    }

    // Update fileName (label)
    if (body.fileName !== undefined) {
      updateData.fileName = body.fileName
    }

    // Update notes
    if (body.notes !== undefined) {
      updateData.notes = body.notes
    }

    const updated = await prisma.document.update({
      where: { id: docId },
      data: updateData,
      include: {
        uploadedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    return NextResponse.json({ ok: true, document: updated })
  } catch (error: any) {
    console.error('Error updating document:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    const docId = parseInt(resolvedParams.docId)

    if (isNaN(leadId) || isNaN(docId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID or document ID' },
        { status: 400 }
      )
    }

    // Get document
    const document = await prisma.document.findUnique({
      where: { id: docId },
    })

    if (!document || document.leadId !== leadId) {
      return NextResponse.json(
        { ok: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    // Delete file if stored locally
    if (document.storagePath && existsSync(document.storagePath)) {
      try {
        await unlink(document.storagePath)
      } catch (error) {
        console.warn('Failed to delete file:', error)
        // Continue with DB deletion even if file deletion fails
      }
    }

    // Delete database record
    await prisma.document.delete({
      where: { id: docId },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error deleting document:', error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}





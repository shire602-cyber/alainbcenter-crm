/**
 * GET /api/leads/[id]/attachments
 * 
 * PHASE 5B: Get all attachments for a lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Get optional filters
    const searchParams = req.nextUrl.searchParams
    const type = searchParams.get('type') // image | document | audio | video
    const conversationId = searchParams.get('conversationId') ? parseInt(searchParams.get('conversationId')!) : null

    const where: any = {
      leadId,
    }

    if (type) {
      where.type = type
    }

    if (conversationId) {
      where.conversationId = conversationId
    }

    // Fetch attachments
    const attachments = await prisma.leadAttachment.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({
      ok: true,
      attachments: attachments.map((att) => ({
        id: att.id,
        type: att.type,
        url: att.url,
        mimeType: att.mimeType,
        filename: att.filename,
        sizeBytes: att.sizeBytes,
        thumbnailUrl: att.thumbnailUrl,
        durationSec: att.durationSec,
        conversationId: att.conversationId,
        messageId: att.messageId,
        createdAt: att.createdAt,
        createdBy: att.createdBy
          ? {
              id: att.createdBy.id,
              name: att.createdBy.name,
              email: att.createdBy.email,
            }
          : null,
      })),
      total: attachments.length,
    })
  } catch (error: any) {
    console.error('Error fetching attachments:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


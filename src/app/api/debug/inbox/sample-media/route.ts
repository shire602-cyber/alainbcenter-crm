import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserApi } from '@/lib/authApi'

/**
 * Debug endpoint to find real media messages for E2E testing
 * ADMIN ONLY - requires authentication
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin access
    const user = await getCurrentUserApi()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find audio messages
    const audioMessage = await prisma.message.findFirst({
      where: {
        OR: [
          { type: { in: ['audio', 'voice_note'] } },
          { mediaMimeType: { startsWith: 'audio/' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        conversationId: true,
        type: true,
        mediaMimeType: true,
        mediaUrl: true,
      },
    })

    // Find image messages
    const imageMessage = await prisma.message.findFirst({
      where: {
        mediaMimeType: { startsWith: 'image/' },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        conversationId: true,
        type: true,
        mediaMimeType: true,
        mediaUrl: true,
      },
    })

    // Find PDF/document messages
    const pdfMessage = await prisma.message.findFirst({
      where: {
        OR: [
          { mediaMimeType: 'application/pdf' },
          { mediaMimeType: { contains: 'pdf' } },
          { filename: { endsWith: '.pdf' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        conversationId: true,
        type: true,
        mediaMimeType: true,
        mediaUrl: true,
        filename: true,
      },
    })

    // Also check attachments
    const audioAttachment = await prisma.leadAttachment.findFirst({
      where: {
        OR: [
          { type: 'audio' },
          { mimeType: { startsWith: 'audio/' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        leadId: true,
        conversationId: true,
        messageId: true,
        type: true,
        mimeType: true,
        url: true,
      },
    })

    const imageAttachment = await prisma.leadAttachment.findFirst({
      where: {
        OR: [
          { type: 'image' },
          { mimeType: { startsWith: 'image/' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        leadId: true,
        conversationId: true,
        messageId: true,
        type: true,
        mimeType: true,
        url: true,
      },
    })

    const pdfAttachment = await prisma.leadAttachment.findFirst({
      where: {
        OR: [
          { type: 'document' },
          { mimeType: 'application/pdf' },
          { mimeType: { contains: 'pdf' } },
          { filename: { endsWith: '.pdf' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        leadId: true,
        conversationId: true,
        messageId: true,
        type: true,
        mimeType: true,
        url: true,
        filename: true,
      },
    })

    const result: any = {
      ok: true,
      audio: audioMessage ? {
        messageId: audioMessage.id,
        conversationId: audioMessage.conversationId,
        type: audioMessage.type,
        mimeType: audioMessage.mediaMimeType,
        url: audioMessage.mediaUrl,
      } : (audioAttachment ? {
        attachmentId: audioAttachment.id,
        messageId: audioAttachment.messageId,
        conversationId: audioAttachment.conversationId,
        leadId: audioAttachment.leadId,
        type: audioAttachment.type,
        mimeType: audioAttachment.mimeType,
        url: audioAttachment.url,
      } : null),
      image: imageMessage ? {
        messageId: imageMessage.id,
        conversationId: imageMessage.conversationId,
        type: imageMessage.type,
        mimeType: imageMessage.mediaMimeType,
        url: imageMessage.mediaUrl,
      } : (imageAttachment ? {
        attachmentId: imageAttachment.id,
        messageId: imageAttachment.messageId,
        conversationId: imageAttachment.conversationId,
        leadId: imageAttachment.leadId,
        type: imageAttachment.type,
        mimeType: imageAttachment.mimeType,
        url: imageAttachment.url,
      } : null),
      pdf: pdfMessage ? {
        messageId: pdfMessage.id,
        conversationId: pdfMessage.conversationId,
        type: pdfMessage.type,
        mimeType: pdfMessage.mediaMimeType,
        url: pdfMessage.mediaUrl,
        filename: pdfMessage.filename,
      } : (pdfAttachment ? {
        attachmentId: pdfAttachment.id,
        messageId: pdfAttachment.messageId,
        conversationId: pdfAttachment.conversationId,
        leadId: pdfAttachment.leadId,
        type: pdfAttachment.type,
        mimeType: pdfAttachment.mimeType,
        url: pdfAttachment.url,
        filename: pdfAttachment.filename,
      } : null),
    }

    // Check if we have at least one media type
    if (!result.audio && !result.image && !result.pdf) {
      return NextResponse.json({
        ok: false,
        reason: 'no media in db',
        searched: {
          audio: 'type=audio/voice_note OR mimeType startsWith audio/',
          image: 'mimeType startsWith image/',
          pdf: 'mimeType=application/pdf OR filename endsWith .pdf',
        },
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[DEBUG] Error finding sample media:', error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }
}


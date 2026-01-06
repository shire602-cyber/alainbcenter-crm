/**
 * POST /api/leads/[id]/attachments/upload
 * 
 * PHASE 5B: Upload attachment (image, document, audio, video) for a lead
 * Can optionally attach to a conversation or message
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
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

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const conversationId = formData.get('conversationId') ? parseInt(formData.get('conversationId') as string) : null
    const messageId = formData.get('messageId') ? parseInt(formData.get('messageId') as string) : null

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size (max 16MB)
    const maxSize = 16 * 1024 * 1024 // 16MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: 'File size exceeds 16MB limit' },
        { status: 400 }
      )
    }

    // Determine attachment type from MIME type
    const mimeType = file.type
    let attachmentType = 'document'
    if (mimeType.startsWith('image/')) {
      attachmentType = 'image'
    } else if (mimeType.startsWith('audio/')) {
      attachmentType = 'audio'
    } else if (mimeType.startsWith('video/')) {
      attachmentType = 'video'
    }

    // Validate file type
    const allowedTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'text/plain',
      // Audio
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/webm',
      // Video
      'video/mp4', 'video/webm', 'video/ogg',
    ]

    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { ok: false, error: `File type ${mimeType} not allowed` },
        { status: 400 }
      )
    }

    // Verify conversation/message if provided
    if (conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      })
      if (!conversation || conversation.leadId !== leadId) {
        return NextResponse.json(
          { ok: false, error: 'Conversation not found or does not belong to lead' },
          { status: 404 }
        )
      }
    }

    if (messageId) {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      })
      if (!message || message.leadId !== leadId) {
        return NextResponse.json(
          { ok: false, error: 'Message not found or does not belong to lead' },
          { status: 404 }
        )
      }
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', 'attachments', String(leadId))
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = `${timestamp}-${sanitizedFileName}`
    const filePath = join(uploadsDir, fileName)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Create public URL
    const fileUrl = `/uploads/attachments/${leadId}/${fileName}`

    // Create attachment record
    const attachment = await prisma.leadAttachment.create({
      data: {
        leadId,
        conversationId: conversationId || null,
        messageId: messageId || null,
        type: attachmentType,
        url: fileUrl,
        mimeType: mimeType,
        filename: file.name,
        sizeBytes: file.size,
        storageProvider: 'local',
        storagePath: filePath,
        createdById: user.id,
      },
    })

    return NextResponse.json({
      ok: true,
      attachment: {
        id: attachment.id,
        type: attachment.type,
        url: attachment.url,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        sizeBytes: attachment.sizeBytes,
        thumbnailUrl: attachment.thumbnailUrl,
        durationSec: attachment.durationSec,
        createdAt: attachment.createdAt,
      },
    })
  } catch (error: any) {
    console.error('Error uploading attachment:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}











import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { uploadMediaToMeta } from '@/lib/whatsapp-media-upload'

/**
 * POST /api/upload
 * Upload a file to Meta's servers and return a media ID
 * For WhatsApp, we upload directly to Meta instead of storing locally
 * This works on Vercel serverless functions (read-only filesystem)
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file size (max 16MB for WhatsApp)
    const maxSize = 16 * 1024 * 1024 // 16MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 16MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/3gpp',
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'audio/ogg',
      'audio/aac',
      'audio/mp4',
      'audio/amr',
      'audio/mpeg',
      'audio/webm', // Added for recorded audio
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      )
    }

    // Read file as buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Meta's servers (works on Vercel)
    const mediaId = await uploadMediaToMeta(buffer, file.type)

    // Return media ID (not a URL - we'll use this ID to send the message)
    return NextResponse.json({
      success: true,
      mediaId, // Meta media ID
      filename: file.name,
      size: file.size,
      type: file.type,
    })
  } catch (error: any) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}


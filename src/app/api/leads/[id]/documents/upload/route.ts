import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { sanitizeFilename } from '@/lib/media/storage'

// POST /api/leads/[id]/documents/upload
// Upload a document file
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi() // Require authentication
    
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Validate lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const categoryValue = formData.get('category') || formData.get('type')
    const category = categoryValue && typeof categoryValue === 'string' ? categoryValue : null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!category) {
      return NextResponse.json(
        { error: 'Document category is required' },
        { status: 400 }
      )
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      )
    }

    // Validate file type (images and PDFs)
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not allowed. Only images and PDFs are supported.' },
        { status: 400 }
      )
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads', String(leadId))
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    // FIX #9: Use centralized sanitizeFilename function for consistency and security
    const timestamp = Date.now()
    const sanitizedFileName = sanitizeFilename(file.name)
    const fileName = `${timestamp}-${sanitizedFileName}`
    const filePath = join(uploadsDir, fileName)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Get current user for uploadedByUserId
    const user = await requireAuthApi()
    const uploadedByUserId = user.id

    // Create document record with new schema fields
    const fileUrl = `/uploads/${leadId}/${fileName}`
    const document = await prisma.document.create({
      data: {
        leadId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageProvider: 'local',
        storagePath: filePath,
        url: fileUrl,
        category: category, // Document category
        uploadedByUserId,
      },
    })

    // Phase 2: Mark info as shared when document is uploaded
    // Documents are typically shared with customers, so trigger follow-up
    try {
      const { markInfoShared } = await import('@/lib/automation/infoShared')
      await markInfoShared(leadId, 'document')
    } catch (error: any) {
      // Don't fail document upload if info sharing detection fails
      console.warn('Failed to mark info as shared after document upload:', error.message)
    }

    // Recompute deal forecast after document upload (non-blocking)
    try {
      const { recomputeAndSaveForecast } = await import('@/lib/forecast/dealForecast')
      recomputeAndSaveForecast(leadId).catch((err) => {
        console.warn(`⚠️ [FORECAST] Failed to recompute forecast after document upload:`, err.message)
      })
    } catch (error) {
      // Forecast not critical - continue
    }

    return NextResponse.json(document, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/documents/upload error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error uploading document' },
      { status: 500 }
    )
  }
}





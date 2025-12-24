/**
 * POST /api/admin/ai-training/upload
 * Upload a file and extract text content for AI training
 * 
 * Features:
 * - UTF-8 encoding with fallback
 * - Retry mechanism for PDF extraction
 * - Automatic vector store indexing
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * Extract text from PDF with exponential backoff retry
 */
async function extractPDFWithRetry(
  buffer: Buffer,
  maxRetries: number = 3
): Promise<string> {
  // Check if pdf-parse is available
  let pdfParse: any = null
  try {
    // Use dynamic import with type assertion to avoid TypeScript errors
    pdfParse = await import('pdf-parse' as any)
  } catch {
    // pdf-parse not installed, return empty immediately
    console.warn('pdf-parse not installed. PDF extraction unavailable.')
    return ''
  }
  
  // If pdf-parse is available, use it with retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // pdf-parse exports a default function
      const pdfParseFn = pdfParse.default || pdfParse
      const data = await pdfParseFn(buffer)
      return data.text || ''
    } catch (error: any) {
      if (attempt === maxRetries) {
        console.error('PDF extraction failed after retries:', error)
        return ''
      }
      // Retry with exponential backoff: 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }
  
  return ''
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminApi()

    const formData = await req.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const type = formData.get('type') as string

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!title || !type) {
      return NextResponse.json(
        { ok: false, error: 'Title and type are required' },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB for text extraction)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { ok: false, error: 'File size exceeds 5MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/markdown',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: 'File type not supported. Only PDF, TXT, DOC, DOCX, and MD files are allowed.' },
        { status: 400 }
      )
    }

    // Read file content with UTF-8 encoding
    const bytes = await file.arrayBuffer()
    let buffer = Buffer.from(bytes)
    
    // Extract text with UTF-8 encoding and retry mechanism
    let content = ''
    
    if (file.type === 'text/plain' || file.type === 'text/markdown') {
      // Try UTF-8 first, fallback to latin1 if needed
      try {
        content = buffer.toString('utf-8')
        // Validate UTF-8
        if (!Buffer.from(content, 'utf-8').equals(buffer)) {
          content = buffer.toString('latin1')
        }
      } catch {
        content = buffer.toString('latin1')
      }
    } else if (file.type === 'application/pdf') {
      // PDF extraction with retry
      content = await extractPDFWithRetry(buffer, 3)
      if (!content) {
        return NextResponse.json(
          { 
            ok: false, 
            error: 'PDF extraction failed after retries. Please copy and paste the content manually, or convert PDF to text first.' 
          },
          { status: 400 }
        )
      }
    } else {
      // For DOC/DOCX, suggest manual input
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Word document extraction not yet implemented. Please copy and paste the content manually.' 
        },
        { status: 400 }
      )
    }

    // Normalize content (remove BOM, normalize line endings)
    content = content
      .replace(/^\uFEFF/, '') // Remove BOM
      .replace(/\r\n/g, '\n') // Normalize line endings
      .trim()

    if (!content.trim()) {
      return NextResponse.json(
        { ok: false, error: 'File appears to be empty or could not be read' },
        { status: 400 }
      )
    }

    // Create training document
    let document
    try {
      document = await prisma.aITrainingDocument.create({
        data: {
          title: title.trim(),
          content: content.trim(),
          type,
          createdByUserId: user.id,
        },
      })
    } catch (error: any) {
      if (error.code === 'P2021' || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { ok: false, error: 'AI Training table does not exist. Please run database migration first.' },
          { status: 503 }
        )
      }
      throw error
    }

    // Index document in vector store (async, don't wait)
    import('@/lib/ai/vectorStore')
      .then(({ indexTrainingDocument }) => indexTrainingDocument(document.id))
      .catch(err => console.warn('Failed to index document in vector store:', err))

    return NextResponse.json({
      ok: true,
      document,
    })
  } catch (error: any) {
    console.error('POST /api/admin/ai-training/upload error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to upload and process file' },
      { status: 500 }
    )
  }
}

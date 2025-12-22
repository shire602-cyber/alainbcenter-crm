import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * GET /api/documents/[docId]/download
 * Streams a document file for download
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const docId = parseInt(resolvedParams.docId)
    
    if (isNaN(docId)) {
      return NextResponse.json(
        { error: 'Invalid document ID' },
        { status: 400 }
      )
    }

    const document = await prisma.document.findUnique({
      where: { id: docId },
    })

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Determine file path based on storage provider
    let filePath: string
    
    if (document.storageProvider === 'local' && document.storagePath) {
      filePath = document.storagePath
    } else if (document.url && document.url.startsWith('/uploads/')) {
      // Fallback to public URL path
      filePath = join(process.cwd(), 'public', document.url)
    } else {
      return NextResponse.json(
        { error: 'Document file not found' },
        { status: 404 }
      )
    }

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Document file not found on server' },
        { status: 404 }
      )
    }

    // Read file
    const fileBuffer = await readFile(filePath)
    
    // Determine content type
    const contentType = document.fileType || 'application/octet-stream'
    
    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${document.fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('GET /api/documents/[docId]/download error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to download document' },
      { status: error.statusCode || 500 }
    )
  }
}

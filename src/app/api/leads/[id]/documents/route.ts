import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/documents
// Create a document entry for a lead (simulated upload)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Validate required fields
    if (!body.type || !body.fileName) {
      return NextResponse.json(
        { error: 'Type and fileName are required' },
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

    // Simulate file URL (placeholder for now)
    const fileUrl = `/uploads/${leadId}/${Date.now()}-${body.fileName}`

    // This endpoint is deprecated - use /api/leads/[id]/documents/upload instead
    return NextResponse.json(
      { error: 'Use /api/leads/[id]/documents/upload endpoint for file uploads' },
      { status: 400 }
    )

    return NextResponse.json(document, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/documents error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error creating document' },
      { status: 500 }
    )
  }
}

// GET /api/leads/[id]/documents
// Get all documents for a lead + requirements for the lead's service type
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
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Get lead to determine service type
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        serviceTypeEnum: true,
        serviceType: {
          select: { name: true }
        }
      }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Get documents
    const documents = await prisma.document.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedByUser: {
          select: { id: true, name: true, email: true }
        }
      }
    })

    // Get requirements for this service type
    const serviceType = lead.serviceTypeEnum || lead.serviceType?.name || ''
    const requirements = serviceType
      ? await prisma.serviceDocumentRequirement.findMany({
          where: { serviceType },
          orderBy: { order: 'asc' }
        })
      : []

    // Map requirements with compliance status
    const now = new Date()
    const requirementsWithStatus = requirements.map(req => {
      // Find matching document
      const matchingDoc = documents.find(
        doc => doc.category?.toLowerCase() === req.documentType.toLowerCase()
      )

      let status: 'missing' | 'uploaded' | 'expiring' | 'expired' = 'missing'
      let expiryDays: number | null = null

      if (matchingDoc) {
        status = 'uploaded'
        
        if (matchingDoc.expiryDate) {
          const expiryDate = new Date(matchingDoc.expiryDate)
          expiryDays = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          )
          
          if (expiryDays < 0) {
            status = 'expired'
          } else if (expiryDays <= 30) {
            status = 'expiring'
          }
        }
      }

      return {
        ...req,
        status,
        expiryDays,
        documentId: matchingDoc?.id || null,
      }
    })

    // Get compliance status
    const { getLeadComplianceStatus } = await import('@/lib/compliance')
    let compliance = null
    try {
      compliance = await getLeadComplianceStatus(leadId)
    } catch (error) {
      // Compliance calculation failed, continue without it
      console.warn('Failed to calculate compliance status:', error)
    }

    return NextResponse.json({
      documents,
      requirements: requirementsWithStatus,
      compliance,
    })
  } catch (error: any) {
    console.error('GET /api/leads/[id]/documents error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error fetching documents' },
      { status: 500 }
    )
  }
}


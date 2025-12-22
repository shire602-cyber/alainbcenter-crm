import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/ai/docs-checklist
// Generate document checklist based on service type
export async function POST(
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

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        serviceType: true,
        documents: true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // TODO: Implement actual AI checklist generation based on service type
    // For now, return a basic checklist based on common documents
    const serviceType = lead.serviceType?.name || lead.serviceTypeEnum || ''
    const uploadedDocs = lead.documents?.map((d: any) => d.category) || []

    let checklist: string[] = []

    if (serviceType.toLowerCase().includes('visa')) {
      checklist = [
        'Passport copy (all pages)',
        'Passport photo',
        'Emirates ID copy',
        'Previous visa copy (if applicable)',
        'Medical fitness certificate',
        'Sponsorship documents',
      ]
    } else if (serviceType.toLowerCase().includes('business')) {
      checklist = [
        'Trade license copy',
        'Memorandum of Association',
        'Share certificates',
        'Bank statement',
        'Passport copies of shareholders',
        'Emirates ID copies',
      ]
    } else {
      checklist = [
        'Passport copy',
        'Emirates ID copy',
        'Passport photo',
        'Supporting documents as required',
      ]
    }

    // Mark uploaded documents
    const checklistWithStatus = checklist.map((item) => {
      const docType = item.toLowerCase()
      const hasDoc = uploadedDocs.some((uploaded: string) => {
        const uploadedLower = uploaded.toLowerCase()
        return (
          docType.includes('passport') && uploadedLower.includes('passport') ||
          docType.includes('emirates id') && uploadedLower.includes('eid') ||
          docType.includes('photo') && uploadedLower.includes('photo') ||
          docType.includes('visa') && uploadedLower.includes('visa')
        )
      })
      return hasDoc ? `✓ ${item}` : `○ ${item}`
    })

    return NextResponse.json({ checklist: checklistWithStatus })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/ai/docs-checklist error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to generate checklist' },
      { status: 500 }
    )
  }
}


















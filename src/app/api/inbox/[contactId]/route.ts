import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    await requireAuthApi()
    
    // Resolve params (Next.js 15+ can have Promise params)
    const resolvedParams = await params
    const contactId = parseInt(resolvedParams.contactId)

    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 })
    }

    // Get contact with latest lead and all logs
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        leads: {
          include: {
            serviceType: true,
            communicationLogs: {
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!contact || contact.leads.length === 0) {
      return NextResponse.json({ error: 'Contact or lead not found' }, { status: 404 })
    }

    const latestLead = contact.leads[0]

    return NextResponse.json({
      contact: {
        id: contact.id,
        fullName: contact.fullName,
        phone: contact.phone,
        email: contact.email,
      },
      lead: {
        id: latestLead.id,
        leadType: latestLead.leadType,
        serviceType: latestLead.serviceType?.name || null,
        status: latestLead.status,
        pipelineStage: latestLead.pipelineStage,
        expiryDate: latestLead.expiryDate,
        aiScore: latestLead.aiScore,
      },
      logs: latestLead.communicationLogs,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load thread' },
      { status: error.statusCode || 500 }
    )
  }
}



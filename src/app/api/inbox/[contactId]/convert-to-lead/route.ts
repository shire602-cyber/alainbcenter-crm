import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { ingestLead } from '@/lib/leadIngest'
import { logAudit } from '@/lib/auditLog'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const contactId = parseInt(resolvedParams.contactId)

    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'Invalid contact ID' }, { status: 400 })
    }

    const body = await req.json()
    const { service, serviceTypeId, notes } = body

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    if (contact.leads.length > 0) {
      return NextResponse.json(
        { error: 'Lead already exists for this contact', leadId: contact.leads[0].id },
        { status: 400 }
      )
    }

    const result = await ingestLead({
      fullName: contact.fullName,
      phone: contact.phone,
      email: contact.email || undefined,
      service: service || undefined,
      serviceTypeId: serviceTypeId || undefined,
      source: 'whatsapp',
      notes: notes || `Converted from WhatsApp conversation`,
      nationality: contact.nationality || undefined,
    })

    await logAudit('lead_created', 'lead', result.lead.id, {
      source: 'whatsapp_conversion',
      contactId: contact.id,
      service: service || serviceTypeId,
    })

    return NextResponse.json({
      success: true,
      lead: result.lead,
      qualification: result.qualification,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to convert to lead' },
      { status: error.statusCode || 500 }
    )
  }
}



import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(
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

    const body = await req.json()
    const { channel, direction, content } = body

    if (!channel || !direction || !content) {
      return NextResponse.json(
        { error: 'Channel, direction, and content are required' },
        { status: 400 }
      )
    }

    // Get contact's latest lead
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!contact || contact.leads.length === 0) {
      return NextResponse.json({ error: 'Contact or lead not found' }, { status: 404 })
    }

    const lead = contact.leads[0]
    const now = new Date()

    // Create communication log
    const log = await prisma.communicationLog.create({
      data: {
        leadId: lead.id,
        channel,
        direction,
        messageSnippet: content.substring(0, 200),
        isRead: direction === 'outbound', // Outbound messages are read by default
      },
    })

    // Update lead lastContactAt
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: now,
        // If outbound and nextFollowUpAt is empty, set to now + 2 days
        ...(direction === 'outbound' && !lead.nextFollowUpAt
          ? {
              nextFollowUpAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
            }
          : {}),
      },
    })

    return NextResponse.json(log)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send message' },
      { status: error.statusCode || 500 }
    )
  }
}


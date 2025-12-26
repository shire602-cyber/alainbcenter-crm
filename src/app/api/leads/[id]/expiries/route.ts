/**
 * POST /api/leads/[id]/expiries
 * Create a new expiry item for a lead
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

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
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { contact: true },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const body = await req.json()

    // Validate required fields
    if (!body.type || !body.expiryDate) {
      return NextResponse.json(
        { error: 'Type and expiryDate are required' },
        { status: 400 }
      )
    }

    // Parse expiry date
    const expiryDate = new Date(body.expiryDate)
    if (isNaN(expiryDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format for expiryDate' },
        { status: 400 }
      )
    }

    // Parse reminder schedule (default: [90,60,30,7,3,1])
    const reminderScheduleDays = body.reminderScheduleDays 
      ? JSON.stringify(body.reminderScheduleDays)
      : JSON.stringify([90, 60, 30, 7, 3, 1])

    // Create expiry item
    const expiryItem = await prisma.expiryItem.create({
      data: {
        contactId: lead.contactId,
        leadId: leadId,
        type: body.type,
        expiryDate: expiryDate,
        reminderScheduleDays: reminderScheduleDays,
        remindersEnabled: body.remindersEnabled !== false, // Default true
        stopRemindersAfterReply: body.stopRemindersAfterReply !== false, // Default true
        notes: body.notes || null,
        assignedUserId: body.assignedUserId || null,
        renewalStatus: body.renewalStatus || 'NOT_STARTED',
      },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(expiryItem)
  } catch (error: any) {
    console.error('POST /api/leads/[id]/expiries error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


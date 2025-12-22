import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { recalcLeadRenewalScore } from '@/lib/renewalScoring'

// POST /api/leads/[id]/expiry-items
// Create a new expiry item for a lead
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

    // Verify lead exists and get contactId
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, contactId: true }
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    if (!lead.contactId) {
      return NextResponse.json(
        { error: 'Lead has no associated contact' },
        { status: 400 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }
    
    if (!body.type || !body.expiryDate) {
      return NextResponse.json(
        { error: 'Missing required fields: type, expiryDate' },
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
    
    // Parse reminder schedule (default [90,60,30,7])
    let reminderScheduleDays = "[90,60,30,7]"
    if (body.reminderScheduleDays) {
      if (Array.isArray(body.reminderScheduleDays)) {
        reminderScheduleDays = JSON.stringify(body.reminderScheduleDays)
      } else if (typeof body.reminderScheduleDays === 'string') {
        reminderScheduleDays = body.reminderScheduleDays
      }
    }
    
    const expiryItem = await prisma.expiryItem.create({
      data: {
        contactId: lead.contactId,
        leadId: leadId,
        type: body.type,
        expiryDate,
        notes: body.notes || null,
        reminderScheduleDays,
        assignedUserId: body.assignedUserId ? parseInt(body.assignedUserId) : null,
      },
      include: {
        contact: {
          select: { id: true, fullName: true, phone: true, email: true }
        },
        lead: {
          select: { id: true, stage: true, priority: true }
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        }
      }
    })
    
    // Recalculate renewal score after creating expiry
    try {
      await recalcLeadRenewalScore(leadId)
    } catch (error) {
      console.warn('Failed to recalculate renewal score:', error)
      // Don't fail the request if score calculation fails
    }
    
    return NextResponse.json(expiryItem, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/expiry-items error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create expiry item' },
      { status: 500 }
    )
  }
}

// GET /api/leads/[id]/expiry-items
// Get all expiry items for a lead
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
    
    const expiryItems = await prisma.expiryItem.findMany({
      where: { leadId },
      include: {
        contact: {
          select: { id: true, fullName: true, phone: true, email: true }
        },
        lead: {
          select: { id: true, stage: true, priority: true }
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        }
      },
      orderBy: {
        expiryDate: 'asc'
      }
    })
    
    return NextResponse.json(expiryItems)
  } catch (error: any) {
    console.error('GET /api/leads/[id]/expiry-items error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch expiry items' },
      { status: 500 }
    )
  }
}












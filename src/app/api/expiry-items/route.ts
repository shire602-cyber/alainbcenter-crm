import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/expiry-items
// List expiry items with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const contactId = searchParams.get('contactId')
    const leadId = searchParams.get('leadId')
    const type = searchParams.get('type')
    const daysWindow = searchParams.get('daysWindow') // e.g., "90" for expiring in 90 days
    const overdue = searchParams.get('overdue') === 'true'
    
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    
    const where: any = {}
    
    if (contactId) {
      where.contactId = parseInt(contactId)
    }
    
    if (leadId) {
      where.leadId = parseInt(leadId)
    }
    
    if (type) {
      where.type = type
    }
    
    if (overdue) {
      where.expiryDate = {
        lt: today
      }
    } else if (daysWindow) {
      const days = parseInt(daysWindow)
      const futureDate = new Date(today)
      futureDate.setUTCDate(futureDate.getUTCDate() + days)
      where.expiryDate = {
        gte: today,
        lte: futureDate
      }
    }
    
    const expiryItems = await prisma.expiryItem.findMany({
      where,
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
    console.error('GET /api/expiry-items error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in GET /api/expiry-items' },
      { status: 500 }
    )
  }
}

// POST /api/expiry-items
// Create a new expiry item
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    if (!body.contactId || !body.type || !body.expiryDate) {
      return NextResponse.json(
        { error: 'Missing required fields: contactId, type, expiryDate' },
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
        contactId: parseInt(body.contactId),
        leadId: body.leadId ? parseInt(body.leadId) : null,
        type: body.type,
        expiryDate,
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
    
    return NextResponse.json(expiryItem, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/expiry-items error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in POST /api/expiry-items' },
      { status: 500 }
    )
  }
}

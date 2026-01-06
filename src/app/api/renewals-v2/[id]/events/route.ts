import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/renewals-v2/[id]/events
 * List events for a renewal item
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const renewalItemId = parseInt(resolvedParams.id)
    
    if (isNaN(renewalItemId)) {
      return NextResponse.json(
        { error: 'Invalid renewal item ID' },
        { status: 400 }
      )
    }

    const events = await prisma.renewalEventLog.findMany({
      where: { renewalItemId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ events })
  } catch (error: any) {
    console.error('GET /api/renewals-v2/[id]/events error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch events' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/renewals-v2/[id]/events
 * Add a NOTE event to renewal item
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    
    const resolvedParams = await params
    const renewalItemId = parseInt(resolvedParams.id)
    
    if (isNaN(renewalItemId)) {
      return NextResponse.json(
        { error: 'Invalid renewal item ID' },
        { status: 400 }
      )
    }

    // Verify renewal item exists
    const renewalItem = await prisma.renewalItem.findUnique({
      where: { id: renewalItemId },
    })

    if (!renewalItem) {
      return NextResponse.json(
        { error: 'Renewal item not found' },
        { status: 404 }
      )
    }

    const body = await req.json()

    if (!body.note || typeof body.note !== 'string') {
      return NextResponse.json(
        { error: 'Note is required' },
        { status: 400 }
      )
    }

    // Create NOTE event
    const event = await prisma.renewalEventLog.create({
      data: {
        renewalItemId,
        type: 'NOTE',
        payload: {
          note: body.note,
        },
        createdByUserId: user.id,
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
      },
    })

    // Optionally update lastContactedAt if this is a contact note
    if (body.markAsContacted) {
      await prisma.renewalItem.update({
        where: { id: renewalItemId },
        data: {
          lastContactedAt: new Date(),
          status: 'CONTACTED',
        },
      })
    }

    return NextResponse.json({ event }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/renewals-v2/[id]/events error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to create event' },
      { status: 500 }
    )
  }
}


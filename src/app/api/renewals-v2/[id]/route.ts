import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/renewals-v2/[id]
 * Get full RenewalItem details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid renewal item ID' },
        { status: 400 }
      )
    }

    const item = await prisma.renewalItem.findUnique({
      where: { id },
      include: {
        lead: {
          include: {
            contact: true,
            assignedUser: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })

    if (!item) {
      return NextResponse.json(
        { error: 'Renewal item not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(item)
  } catch (error: any) {
    console.error('GET /api/renewals-v2/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch renewal item' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/renewals-v2/[id]
 * Update RenewalItem: expiresAt, expectedValue, status, assignedToUserId, notes
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid renewal item ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Build update data
    const updateData: any = {}
    
    if (body.expiresAt !== undefined) {
      updateData.expiresAt = new Date(body.expiresAt)
    }
    
    if (body.expectedValue !== undefined) {
      updateData.expectedValue = body.expectedValue ? parseInt(body.expectedValue) : null
    }
    
    if (body.status !== undefined) {
      updateData.status = body.status
    }
    
    if (body.assignedToUserId !== undefined) {
      updateData.assignedToUserId = body.assignedToUserId ? parseInt(body.assignedToUserId) : null
    }
    
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null
    }

    if (body.probability !== undefined) {
      updateData.probability = parseInt(body.probability) || 70
    }

    if (body.nextActionAt !== undefined) {
      updateData.nextActionAt = body.nextActionAt ? new Date(body.nextActionAt) : null
    }

    const updated = await prisma.renewalItem.update({
      where: { id },
      data: updateData,
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('PATCH /api/renewals-v2/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update renewal item' },
      { status: 500 }
    )
  }
}


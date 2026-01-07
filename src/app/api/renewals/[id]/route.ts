import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/renewals/[id]
 * Get full Renewal details
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
        { error: 'Invalid renewal ID' },
        { status: 400 }
      )
    }

    const renewal = await prisma.renewal.findUnique({
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
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!renewal) {
      return NextResponse.json(
        { error: 'Renewal not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(renewal)
  } catch (error: any) {
    console.error('GET /api/renewals/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch renewal' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/renewals/[id]
 * Update Renewal with status transitions that trigger lastContactedAt/nextFollowUpAt
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    
    const resolvedParams = await params
    const id = parseInt(resolvedParams.id)
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid renewal ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Get current renewal to check status transitions
    const current = await prisma.renewal.findUnique({
      where: { id },
      select: { status: true, lastContactedAt: true },
    })

    if (!current) {
      return NextResponse.json(
        { error: 'Renewal not found' },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {}
    const now = new Date()
    
    // Status transitions that should update lastContactedAt
    const statusesThatMarkContacted = ['CONTACTED', 'IN_PROGRESS']
    const isTransitioningToContacted = body.status && 
      current.status === 'ACTIVE' && 
      statusesThatMarkContacted.includes(body.status)
    
    // Status transitions
    if (body.status !== undefined) {
      updateData.status = body.status
      
      // Auto-update lastContactedAt on status transitions to CONTACTED or IN_PROGRESS
      if (isTransitioningToContacted) {
        updateData.lastContactedAt = now
      }
      
      // Auto-update lastContactedAt if transitioning from EXPIRED to any active status
      if (current.status === 'EXPIRED' && body.status !== 'EXPIRED' && body.status !== 'LOST') {
        updateData.lastContactedAt = now
      }
    }
    
    // Expiry date
    if (body.expiryDate !== undefined) {
      updateData.expiryDate = new Date(body.expiryDate)
    }
    
    // Estimated value
    if (body.estimatedValue !== undefined) {
      updateData.estimatedValue = body.estimatedValue ? parseInt(body.estimatedValue) : null
    }
    
    // Assign user
    if (body.assignedUserId !== undefined) {
      updateData.assignedUserId = body.assignedUserId ? parseInt(body.assignedUserId) : null
    }
    
    // Notes
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null
    }

    // Next follow-up date
    if (body.nextFollowUpAt !== undefined) {
      updateData.nextFollowUpAt = body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null
    }

    // Last contacted (can be explicitly set)
    if (body.lastContactedAt !== undefined) {
      updateData.lastContactedAt = body.lastContactedAt ? new Date(body.lastContactedAt) : now
    }

    const updated = await prisma.renewal.update({
      where: { id },
      data: updateData,
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('PATCH /api/renewals/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update renewal' },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { recalcLeadRenewalScore } from '@/lib/renewalScoring'

/**
 * PATCH /api/expiry-items/[id]
 * Update an expiry item (e.g., renewal status, renewal lead ID)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const expiryItemId = parseInt(resolvedParams.id)
    
    if (isNaN(expiryItemId)) {
      return NextResponse.json(
        { error: 'Invalid expiry item ID' },
        { status: 400 }
      )
    }

    const body = await req.json()

    // Build update data
    const updateData: any = {}
    if (body.renewalStatus !== undefined) {
      updateData.renewalStatus = body.renewalStatus
    }
    if (body.renewalLeadId !== undefined) {
      updateData.renewalLeadId = body.renewalLeadId ? parseInt(body.renewalLeadId) : null
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null
    }
    if (body.lastReminderSentAt !== undefined) {
      updateData.lastReminderSentAt = body.lastReminderSentAt ? new Date(body.lastReminderSentAt) : null
    }
    if (body.lastReminderChannel !== undefined) {
      updateData.lastReminderChannel = body.lastReminderChannel || null
    }
    if (body.reminderCount !== undefined) {
      updateData.reminderCount = parseInt(body.reminderCount) || 0
    }

    const expiryItem = await prisma.expiryItem.update({
      where: { id: expiryItemId },
      data: updateData,
      include: {
        contact: {
          select: { id: true, fullName: true, phone: true, email: true }
        },
        lead: {
          select: { id: true, stage: true, priority: true }
        },
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        renewalLead: {
          select: { id: true, stage: true }
        }
      }
    })

    // Recalculate renewal score if leadId exists
    if (expiryItem.leadId) {
      try {
        await recalcLeadRenewalScore(expiryItem.leadId)
      } catch (error) {
        console.warn('Failed to recalculate renewal score:', error)
        // Don't fail the request if score calculation fails
      }
    }

    return NextResponse.json(expiryItem)
  } catch (error: any) {
    console.error('PATCH /api/expiry-items/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update expiry item' },
      { status: 500 }
    )
  }
}

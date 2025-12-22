/**
 * POST /api/leads/[id]/renewal
 * 
 * Handle renewal actions: update estimated value, mark won/lost
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { recalcLeadRenewalScore } from '@/lib/renewalScoring'

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

    const body = await req.json()
    const { action, estimatedRenewalValue, reason } = body

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
        },
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    if (action === 'update_value') {
      // Update estimated renewal value
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          estimatedRenewalValue: estimatedRenewalValue ? estimatedRenewalValue.toString() : null,
        },
      })

      // Recalculate renewal score
      await recalcLeadRenewalScore(leadId)

      return NextResponse.json({ ok: true })
    }

    if (action === 'mark_won') {
      // Mark renewal as won
      const nearestExpiry = lead.expiryItems?.[0]
      
      if (nearestExpiry) {
        // Update expiry status
        await prisma.expiryItem.update({
          where: { id: nearestExpiry.id },
          data: {
            renewalStatus: 'RENEWED',
          },
        })
      }

      // Update lead stage to WON if not already
      const updateData: any = {
        stage: 'COMPLETED_WON',
        pipelineStage: 'won',
      }

      // Add note about renewal
      const renewalNote = `Renewal confirmed – amount: ${estimatedRenewalValue || 'N/A'} AED, date: ${new Date().toLocaleDateString()}`
      updateData.notes = lead.notes 
        ? `${lead.notes}\n\n${renewalNote}`
        : renewalNote

      await prisma.lead.update({
        where: { id: leadId },
        data: updateData,
      })

      // Recalculate renewal score
      await recalcLeadRenewalScore(leadId)

      return NextResponse.json({ ok: true })
    }

    if (action === 'mark_lost') {
      // Mark renewal as lost
      if (!reason) {
        return NextResponse.json(
          { error: 'Reason is required when marking renewal as lost' },
          { status: 400 }
        )
      }

      const nearestExpiry = lead.expiryItems?.[0]
      
      if (nearestExpiry) {
        // Update expiry status
        await prisma.expiryItem.update({
          where: { id: nearestExpiry.id },
          data: {
            renewalStatus: 'NOT_RENEWING',
          },
        })
      }

      // Update lead notes with reason
      const lostNote = `Renewal lost – reason: ${reason}, date: ${new Date().toLocaleDateString()}`
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          notes: lead.notes 
            ? `${lead.notes}\n\n${lostNote}`
            : lostNote,
          renewalNotes: `Renewal lost: ${reason}`,
        },
      })

      // Recalculate renewal score
      await recalcLeadRenewalScore(leadId)

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('POST /api/leads/[id]/renewal error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to process renewal action' },
      { status: 500 }
    )
  }
}
















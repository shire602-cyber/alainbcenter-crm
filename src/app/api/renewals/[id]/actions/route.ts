import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { upsertConversation } from '@/lib/conversation/upsert'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

/**
 * POST /api/renewals/[id]/actions
 * Handle renewal actions: call, whatsapp, email, change-status, assign, schedule
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthApi()
    
    const resolvedParams = await params
    const renewalId = parseInt(resolvedParams.id)
    
    if (isNaN(renewalId)) {
      return NextResponse.json(
        { error: 'Invalid renewal ID' },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { action, ...actionData } = body

    // Get renewal with lead and contact
    const renewal = await prisma.renewal.findUnique({
      where: { id: renewalId },
      include: {
        lead: {
          include: {
            contact: true,
          },
        },
      },
    })

    if (!renewal) {
      return NextResponse.json(
        { error: 'Renewal not found' },
        { status: 404 }
      )
    }

    const now = new Date()
    const updateData: any = {}

    switch (action) {
      case 'call':
        // Call action: mark as contacted
        updateData.lastContactedAt = now
        if (renewal.status === 'ACTIVE' || renewal.status === 'EXPIRED') {
          updateData.status = 'CONTACTED'
        }
        break

      case 'whatsapp':
        // WhatsApp action: send message and mark as contacted
        if (!renewal.lead.contact.phone) {
          return NextResponse.json(
            { error: 'Contact does not have a phone number' },
            { status: 400 }
          )
        }

        const message = actionData.message || 'Hello, this is regarding your renewal.'

        // Find or create conversation
        const { id: conversationId } = await upsertConversation({
          contactId: renewal.lead.contactId,
          channel: 'whatsapp',
          leadId: renewal.leadId,
        })
        
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
        })
        
        if (!conversation) {
          return NextResponse.json(
            { error: 'Failed to create conversation' },
            { status: 500 }
          )
        }

        // Send WhatsApp message via idempotency system
        const sendResult = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: renewal.lead.contactId,
          leadId: renewal.leadId,
          phone: renewal.lead.contact.phone,
          text: message,
          provider: 'whatsapp',
          triggerProviderMessageId: null,
          replyType: 'manual',
          lastQuestionKey: null,
          flowStep: null,
        })

        if (!sendResult.success && !sendResult.wasDuplicate) {
          return NextResponse.json(
            { error: sendResult.error || 'Failed to send WhatsApp message' },
            { status: 500 }
          )
        }

        // Mark as contacted
        updateData.lastContactedAt = now
        if (renewal.status === 'ACTIVE' || renewal.status === 'EXPIRED') {
          updateData.status = 'CONTACTED'
        }
        break

      case 'email':
        // Email action: mark as contacted (actual email sending can be added later)
        updateData.lastContactedAt = now
        if (renewal.status === 'ACTIVE' || renewal.status === 'EXPIRED') {
          updateData.status = 'CONTACTED'
        }
        break

      case 'change-status':
        // Change status with proper transitions
        if (!actionData.status) {
          return NextResponse.json(
            { error: 'Status is required' },
            { status: 400 }
          )
        }

        updateData.status = actionData.status
        
        // Update lastContactedAt on status transitions
        const statusesThatMarkContacted = ['CONTACTED', 'IN_PROGRESS']
        if (statusesThatMarkContacted.includes(actionData.status) && 
            (renewal.status === 'ACTIVE' || renewal.status === 'EXPIRED')) {
          updateData.lastContactedAt = now
        }
        break

      case 'assign':
        // Assign owner
        if (actionData.assignedUserId !== undefined) {
          updateData.assignedUserId = actionData.assignedUserId ? parseInt(actionData.assignedUserId) : null
        }
        break

      case 'schedule':
        // Schedule follow-up
        if (actionData.nextFollowUpAt) {
          updateData.nextFollowUpAt = new Date(actionData.nextFollowUpAt)
        } else if (actionData.daysFromNow) {
          const followUpDate = new Date()
          followUpDate.setDate(followUpDate.getDate() + parseInt(actionData.daysFromNow))
          updateData.nextFollowUpAt = followUpDate
        } else {
          return NextResponse.json(
            { error: 'nextFollowUpAt or daysFromNow is required' },
            { status: 400 }
          )
        }
        break

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }

    // Update renewal
    const updated = await prisma.renewal.update({
      where: { id: renewalId },
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

    return NextResponse.json({
      success: true,
      renewal: updated,
      message: getActionSuccessMessage(action),
    })
  } catch (error: any) {
    console.error('POST /api/renewals/[id]/actions error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to perform action' },
      { status: 500 }
    )
  }
}

function getActionSuccessMessage(action: string): string {
  const messages: Record<string, string> = {
    call: 'Call logged, renewal marked as contacted',
    whatsapp: 'WhatsApp message sent successfully',
    email: 'Email logged, renewal marked as contacted',
    'change-status': 'Status updated successfully',
    assign: 'Owner assigned successfully',
    schedule: 'Follow-up scheduled successfully',
  }
  return messages[action] || 'Action completed successfully'
}


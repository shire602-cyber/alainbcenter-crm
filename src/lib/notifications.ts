/**
 * Notification System
 * 
 * Creates notifications for users when AI cannot respond to untrained subjects
 */

import { prisma } from './prisma'

export interface CreateNotificationInput {
  type: 'ai_untrained' | 'unreplied_message' | 'task_assigned' | 'system'
  title: string
  message: string
  leadId?: number
  conversationId?: number
}

/**
 * Create a notification for all users when AI cannot respond
 */
export async function createNotificationForAllUsers(
  input: CreateNotificationInput
): Promise<void> {
  try {
    // Get all active users
    const users = await prisma.user.findMany({
      where: {
        // Only active users (no deleted flag in schema, so get all)
      },
      select: {
        id: true,
      },
    })

    if (users.length === 0) {
      console.warn('No users found to notify')
      return
    }

    // Create notification (not user-specific, but visible to all)
    // We'll create one notification that all users can see
    await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        leadId: input.leadId,
        conversationId: input.conversationId,
        isRead: false,
      },
    })

    console.log(`✅ Created notification: ${input.title} (${users.length} users can see it)`)
  } catch (error: any) {
    console.error('Failed to create notification:', error.message)
    // Don't throw - notifications are non-critical
  }
}

/**
 * Create notification when AI cannot respond to untrained subject
 */
export async function notifyAIUntrainedSubject(
  leadId: number,
  conversationId: number | null,
  customerQuery: string,
  reason: string
): Promise<void> {
  try {
    console.log(`🔔 Creating notification for untrained subject (lead ${leadId}, conversation ${conversationId})`)
    
    const contact = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        contact: {
          select: {
            fullName: true,
            phone: true,
          },
        },
      },
    })

    const customerName = contact?.contact?.fullName || contact?.contact?.phone || 'Customer'
    const queryPreview = customerQuery.length > 50 
      ? customerQuery.substring(0, 50) + '...' 
      : customerQuery

    await createNotificationForAllUsers({
      type: 'ai_untrained',
      title: `AI Needs Human Help: ${customerName}`,
      message: `Customer asked about "${queryPreview}". AI is not trained on this subject. Reason: ${reason}. Please reply manually.`,
      leadId,
      conversationId: conversationId || undefined,
    })
    
    console.log(`✅ Notification created successfully for lead ${leadId}`)
  } catch (error: any) {
    console.error(`❌ Failed to create notification for untrained subject:`, error.message)
    // Don't throw - notifications are non-critical
  }
}


/**
 * ADMIN ONLY: Permanent deletion of lead and all related data
 * 
 * This endpoint allows admins to permanently delete a lead and all related data:
 * - Lead
 * - Tasks
 * - Documents
 * - Reminders
 * - Communication logs
 * - Outbound message logs
 * - Auto reply logs
 * - AI drafts
 * - AI action logs
 * - Expiry items (unlinked, not deleted)
 * - Messages linked to lead
 * 
 * WARNING: This is permanent and cannot be undone!
 * Note: Contact is NOT deleted, only the lead and its data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    // Require admin access
    await requireAdminApi()
    
    const body = await req.json()
    const { leadId } = body
    
    if (!leadId) {
      return NextResponse.json(
        { error: 'leadId is required' },
        { status: 400 }
      )
    }
    
    // Find lead
    const lead = await prisma.lead.findUnique({
      where: { id: parseInt(leadId) },
      select: {
        id: true,
        contactId: true,
        serviceTypeEnum: true,
      },
    })
    
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }
    
    console.log(`🗑️ [ADMIN-DELETE] Starting permanent deletion of lead ${lead.id}`)
    
    const deletionLog: string[] = []
    
    // Delete in order to respect foreign key constraints
    
    // 1. Delete auto reply logs (must be before lead deletion)
    const autoReplyCount = await prisma.autoReplyLog.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${autoReplyCount.count} auto reply log(s)`)
    
    // 2. Delete tasks
    const taskCount = await prisma.task.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${taskCount.count} task(s)`)
    
    // 3. Delete documents
    const docCount = await prisma.document.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${docCount.count} document(s)`)
    
    // 4. Delete reminders
    const reminderCount = await prisma.reminder.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${reminderCount.count} reminder(s)`)
    
    // 5. Delete automation run logs
    const automationCount = await prisma.automationRunLog.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${automationCount.count} automation run log(s)`)
    
    // 6. Delete AI drafts
    const draftCount = await prisma.aIDraft.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${draftCount.count} AI draft(s)`)
    
    // 7. Delete AI action logs
    const aiActionCount = await prisma.aIActionLog.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${aiActionCount.count} AI action log(s)`)
    
    // 8. Delete notifications
    const notificationCount = await prisma.notification.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${notificationCount.count} notification(s)`)
    
    // 9. Unlink expiry items (set leadId to null, don't delete)
    const expiryCount = await prisma.expiryItem.updateMany({
      where: { leadId: lead.id },
      data: { leadId: null },
    })
    deletionLog.push(`Unlinked ${expiryCount.count} expiry item(s)`)
    
    // 10. Delete messages linked to lead
    const messageCount = await prisma.message.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${messageCount.count} message(s)`)
    
    // 11. Delete communication logs linked to lead
    const logCount = await prisma.communicationLog.deleteMany({
      where: { leadId: lead.id },
    })
    deletionLog.push(`Deleted ${logCount.count} communication log(s)`)
    
    // 12. Delete outbound message logs linked to lead (via conversation)
    const conversations = await prisma.conversation.findMany({
      where: { leadId: lead.id },
      select: { id: true },
    })
    
    for (const conv of conversations) {
      const outboundCount = await prisma.outboundMessageLog.deleteMany({
        where: { conversationId: conv.id },
      })
      deletionLog.push(`Deleted ${outboundCount.count} outbound message log(s) from conversation ${conv.id}`)
    }
    
    // 13. Update conversations to remove leadId (don't delete conversations)
    const convUpdateCount = await prisma.conversation.updateMany({
      where: { leadId: lead.id },
      data: { leadId: null },
    })
    deletionLog.push(`Unlinked ${convUpdateCount.count} conversation(s)`)
    
    // 14. Finally, delete the lead
    await prisma.lead.delete({
      where: { id: lead.id },
    })
    deletionLog.push(`Deleted lead ${lead.id}`)
    
    console.log(`✅ [ADMIN-DELETE] Successfully deleted lead ${lead.id} and all related data`)
    
    return NextResponse.json({
      success: true,
      message: `Lead ${lead.id} permanently deleted`,
      deleted: {
        leadId: lead.id,
        contactId: lead.contactId,
        serviceType: lead.serviceTypeEnum,
      },
      deletionLog,
    })
  } catch (error: any) {
    console.error('[ADMIN-DELETE] Error:', error)
    
    if (error.statusCode === 401 || error.statusCode === 403) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to delete lead' },
      { status: 500 }
    )
  }
}


/**
 * ADMIN ONLY: Permanent deletion of contact and all related data
 * 
 * This endpoint allows admins to permanently delete a contact and all related data:
 * - Contact
 * - Leads
 * - Conversations
 * - Messages
 * - Tasks
 * - Documents
 * - Reminders
 * - Communication logs
 * - Outbound message logs
 * - Auto reply logs
 * - AI drafts
 * - AI action logs
 * - Expiry items
 * - Chat messages
 * - Automation run logs
 * 
 * WARNING: This is permanent and cannot be undone!
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { normalizeToE164 } from '@/lib/phone'

export async function POST(req: NextRequest) {
  try {
    // Require admin access
    await requireAdminApi()
    
    const body = await req.json()
    const { phone, contactId } = body
    
    if (!phone && !contactId) {
      return NextResponse.json(
        { error: 'Either phone or contactId is required' },
        { status: 400 }
      )
    }
    
    // Find contact
    let contact
    if (contactId) {
      contact = await prisma.contact.findUnique({
        where: { id: parseInt(contactId) },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
          fullName: true,
        },
      })
    } else if (phone) {
      const normalized = normalizeToE164(phone)
      contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: phone },
            { phone: normalized },
            { phoneNormalized: phone },
            { phoneNormalized: normalized },
          ],
        },
        select: {
          id: true,
          phone: true,
          phoneNormalized: true,
          fullName: true,
        },
      })
    }
    
    if (!contact) {
      return NextResponse.json(
        { error: 'Contact not found' },
        { status: 404 }
      )
    }
    
    console.log(`🗑️ [ADMIN-DELETE] Starting permanent deletion of contact ${contact.id} (${contact.fullName || contact.phone})`)
    
    // Get all leads for this contact
    const leads = await prisma.lead.findMany({
      where: { contactId: contact.id },
      select: { id: true },
    })
    
    // Get all conversations for this contact
    const conversations = await prisma.conversation.findMany({
      where: { contactId: contact.id },
      select: { id: true },
    })
    
    const deletionLog: string[] = []
    
    // Delete in order to respect foreign key constraints
    
    // 1. Delete messages for all conversations
    for (const conv of conversations) {
      const messageCount = await prisma.message.deleteMany({
        where: { conversationId: conv.id },
      })
      deletionLog.push(`Deleted ${messageCount.count} message(s) from conversation ${conv.id}`)
      
      // Delete communication logs
      const logCount = await prisma.communicationLog.deleteMany({
        where: { conversationId: conv.id },
      })
      deletionLog.push(`Deleted ${logCount.count} communication log(s) from conversation ${conv.id}`)
      
      // Delete outbound message logs
      const outboundCount = await prisma.outboundMessageLog.deleteMany({
        where: { conversationId: conv.id },
      })
      deletionLog.push(`Deleted ${outboundCount.count} outbound message log(s) from conversation ${conv.id}`)
    }
    
    // 2. Delete conversations
    const convCount = await prisma.conversation.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${convCount.count} conversation(s)`)
    
    // 3. Delete leads and related data
    for (const lead of leads) {
      // Delete auto reply logs (must be before lead deletion)
      const autoReplyCount = await prisma.autoReplyLog.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${autoReplyCount.count} auto reply log(s) for lead ${lead.id}`)
      
      // Delete tasks
      const taskCount = await prisma.task.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${taskCount.count} task(s) for lead ${lead.id}`)
      
      // Delete documents
      const docCount = await prisma.document.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${docCount.count} document(s) for lead ${lead.id}`)
      
      // Delete reminders
      const reminderCount = await prisma.reminder.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${reminderCount.count} reminder(s) for lead ${lead.id}`)
      
      // Delete automation run logs
      const automationCount = await prisma.automationRunLog.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${automationCount.count} automation run log(s) for lead ${lead.id}`)
      
      // Delete AI drafts
      const draftCount = await prisma.aIDraft.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${draftCount.count} AI draft(s) for lead ${lead.id}`)
      
      // Delete AI action logs
      const aiActionCount = await prisma.aIActionLog.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${aiActionCount.count} AI action log(s) for lead ${lead.id}`)
      
      // Delete notifications
      const notificationCount = await prisma.notification.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${notificationCount.count} notification(s) for lead ${lead.id}`)
      
      // Delete expiry items linked to this lead
      const expiryCount = await prisma.expiryItem.updateMany({
        where: { leadId: lead.id },
        data: { leadId: null }, // Set to null instead of deleting (expiry items may be linked to contact)
      })
      deletionLog.push(`Unlinked ${expiryCount.count} expiry item(s) from lead ${lead.id}`)
      
      // Delete messages linked to lead
      const leadMessageCount = await prisma.message.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${leadMessageCount.count} message(s) linked to lead ${lead.id}`)
      
      // Delete communication logs linked to lead
      const leadLogCount = await prisma.communicationLog.deleteMany({
        where: { leadId: lead.id },
      })
      deletionLog.push(`Deleted ${leadLogCount.count} communication log(s) linked to lead ${lead.id}`)
    }
    
    // Delete leads
    const leadCount = await prisma.lead.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${leadCount.count} lead(s)`)
    
    // 4. Delete expiry items for this contact
    const expiryCount = await prisma.expiryItem.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${expiryCount.count} expiry item(s)`)
    
    // 5. Delete chat messages
    const chatMessageCount = await prisma.chatMessage.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${chatMessageCount.count} chat message(s)`)
    
    // 6. Delete automation run logs
    const automationCount = await prisma.automationRunLog.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${automationCount.count} automation run log(s)`)
    
    // 7. Delete AI action logs
    const aiActionCount = await prisma.aIActionLog.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${aiActionCount.count} AI action log(s) by contactId`)
    
    // 8. Delete AI drafts
    const draftCount = await prisma.aIDraft.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${draftCount.count} AI draft(s) by contactId`)
    
    // 9. Delete auto reply logs
    const autoReplyCount = await prisma.autoReplyLog.deleteMany({
      where: { contactId: contact.id },
    })
    deletionLog.push(`Deleted ${autoReplyCount.count} auto reply log(s) by contactId`)
    
    // 10. Finally, delete the contact
    await prisma.contact.delete({
      where: { id: contact.id },
    })
    deletionLog.push(`Deleted contact ${contact.id}`)
    
    console.log(`✅ [ADMIN-DELETE] Successfully deleted contact ${contact.id} and all related data`)
    
    return NextResponse.json({
      success: true,
      message: `Contact ${contact.id} (${contact.fullName || contact.phone}) permanently deleted`,
      deleted: {
        contactId: contact.id,
        contactName: contact.fullName,
        contactPhone: contact.phone,
        leadsCount: leads.length,
        conversationsCount: conversations.length,
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
      { error: error.message || 'Failed to delete contact' },
      { status: 500 }
    )
  }
}


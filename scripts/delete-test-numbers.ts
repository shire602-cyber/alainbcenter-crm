/**
 * Script to delete all data for test phone numbers
 * 
 * Deletes:
 * - Contacts
 * - Conversations
 * - Messages
 * - Leads
 * - Tasks
 * - Notifications
 * - Communication logs
 * - Outbound message logs
 * - Message status events
 * - AI drafts
 * - AI action logs
 * 
 * Phone numbers to delete:
 * - +971507042270
 * - +971556515839
 * - +260777711059
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_NUMBERS = [
  '+971507042270',
  '+971556515839',
  '+260777711059',
]

// Normalize phone numbers to try different formats
function normalizePhoneVariants(phone: string): string[] {
  const variants = new Set<string>()
  
  // Original
  variants.add(phone)
  
  // Without +
  if (phone.startsWith('+')) {
    variants.add(phone.substring(1))
  } else {
    variants.add('+' + phone)
  }
  
  // Remove leading zeros
  const withoutPlus = phone.replace(/^\+/, '')
  if (withoutPlus.startsWith('0')) {
    variants.add('+' + withoutPlus.substring(1))
    variants.add(withoutPlus.substring(1))
  }
  
  return Array.from(variants)
}

async function deleteTestNumbers() {
  console.log('🗑️ Starting deletion of test phone numbers...')
  console.log('Test numbers:', TEST_NUMBERS.join(', '))
  
  try {
    // Collect all phone number variants
    const allPhoneVariants = new Set<string>()
    TEST_NUMBERS.forEach(phone => {
      normalizePhoneVariants(phone).forEach(variant => allPhoneVariants.add(variant))
    })
    
    const phoneList = Array.from(allPhoneVariants)
    console.log(`📱 Searching for contacts with phone variants:`, phoneList)
    
    // Find all contacts matching these phone numbers
    const contacts = await prisma.contact.findMany({
      where: {
        OR: phoneList.map(phone => ({
          phone: {
            contains: phone.replace(/^\+/, ''), // Search for phone without + as well
          },
        })),
      },
      include: {
        conversations: {
          select: { id: true },
        },
        leads: {
          select: { id: true },
        },
      },
    })
    
    console.log(`📋 Found ${contacts.length} contacts to delete`)
    
    if (contacts.length === 0) {
      console.log('✅ No contacts found with these phone numbers')
      return
    }
    
    // Collect all conversation IDs and lead IDs
    const conversationIds: number[] = []
    const leadIds: number[] = []
    const contactIds: number[] = []
    
    contacts.forEach(contact => {
      contactIds.push(contact.id)
      contact.conversations.forEach(conv => conversationIds.push(conv.id))
      contact.leads.forEach(lead => leadIds.push(lead.id))
    })
    
    console.log(`📊 Summary:`)
    console.log(`  - Contacts: ${contactIds.length}`)
    console.log(`  - Conversations: ${conversationIds.length}`)
    console.log(`  - Leads: ${leadIds.length}`)
    
    // Delete in smaller transactions to avoid timeout
    // Get message IDs first
    let messageIds: number[] = []
    if (conversationIds.length > 0) {
      const messages = await prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { id: true },
      })
      messageIds = messages.map(m => m.id)
    }
    
    // 1. Delete message status events
    if (conversationIds.length > 0 || messageIds.length > 0) {
      const deletedStatusEvents = await prisma.messageStatusEvent.deleteMany({
        where: {
          OR: [
            { conversationId: { in: conversationIds } },
            ...(messageIds.length > 0 ? [{ messageId: { in: messageIds } }] : []),
          ],
        },
      })
      console.log(`  ✅ Deleted ${deletedStatusEvents.count} message status events`)
    }
    
    // 2. Delete outbound message logs
    if (conversationIds.length > 0) {
      const deletedOutboundLogs = await (prisma as any).outboundMessageLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedOutboundLogs.count} outbound message logs`)
    }
    
    // 3. Delete messages
    if (conversationIds.length > 0) {
      const deletedMessages = await prisma.message.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedMessages.count} messages`)
    }
    
    // 4. Delete communication logs
    if (conversationIds.length > 0) {
      const deletedCommLogs = await prisma.communicationLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedCommLogs.count} communication logs`)
    }
    
    // 5. Delete AI drafts
    if (conversationIds.length > 0) {
      const deletedDrafts = await prisma.aIDraft.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedDrafts.count} AI drafts`)
    }
    
    // 6. Delete AI action logs
    if (conversationIds.length > 0) {
      const deletedActionLogs = await prisma.aIActionLog.deleteMany({
        where: { conversationId: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedActionLogs.count} AI action logs`)
    }
    
    // 7. Delete tasks (by conversation and by lead)
    if (conversationIds.length > 0 || leadIds.length > 0) {
      const deletedTasks = await prisma.task.deleteMany({
        where: {
          OR: [
            { conversationId: { in: conversationIds } },
            { leadId: { in: leadIds } },
          ],
        },
      })
      console.log(`  ✅ Deleted ${deletedTasks.count} tasks`)
    }
    
    // 8. Delete notifications (by conversation and by lead)
    if (conversationIds.length > 0 || leadIds.length > 0) {
      const deletedNotifications = await prisma.notification.deleteMany({
        where: {
          OR: [
            { conversationId: { in: conversationIds } },
            { leadId: { in: leadIds } },
          ],
        },
      })
      console.log(`  ✅ Deleted ${deletedNotifications.count} notifications`)
    }
    
    // 9. Delete expiry items
    if (leadIds.length > 0) {
      const deletedExpiries = await prisma.expiryItem.deleteMany({
        where: { leadId: { in: leadIds } },
      })
      console.log(`  ✅ Deleted ${deletedExpiries.count} expiry items`)
    }
    
    // 10. Delete documents
    if (leadIds.length > 0) {
      const deletedDocs = await prisma.document.deleteMany({
        where: { leadId: { in: leadIds } },
      })
      console.log(`  ✅ Deleted ${deletedDocs.count} documents`)
    }
    
    // 11. Delete auto reply logs
    if (contactIds.length > 0 || leadIds.length > 0) {
      const deletedAutoReplyLogs = await (prisma as any).autoReplyLog.deleteMany({
        where: {
          OR: [
            { contactId: { in: contactIds } },
            { leadId: { in: leadIds } },
          ],
        },
      })
      console.log(`  ✅ Deleted ${deletedAutoReplyLogs.count} auto reply logs`)
    }
    
    // 12. Delete conversations
    if (conversationIds.length > 0) {
      const deletedConversations = await prisma.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      })
      console.log(`  ✅ Deleted ${deletedConversations.count} conversations`)
    }
    
    // 13. Delete leads
    if (leadIds.length > 0) {
      const deletedLeads = await prisma.lead.deleteMany({
        where: { id: { in: leadIds } },
      })
      console.log(`  ✅ Deleted ${deletedLeads.count} leads`)
    }
    
    // 14. Delete contacts (last, as everything references them)
    if (contactIds.length > 0) {
      const deletedContacts = await prisma.contact.deleteMany({
        where: { id: { in: contactIds } },
      })
      console.log(`  ✅ Deleted ${deletedContacts.count} contacts`)
    }
    
    console.log('✅ Successfully deleted all data for test phone numbers')
  } catch (error: any) {
    console.error('❌ Error deleting test numbers:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
deleteTestNumbers()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

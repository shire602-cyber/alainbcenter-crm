/**
 * Delete all data relating to test phone numbers
 * 
 * Numbers to delete:
 * - +971507042270
 * - +971556515839
 */

import { prisma } from '../src/lib/prisma'
import { normalizeToE164 } from '../src/lib/phone'

const TEST_NUMBERS = [
  '+971507042270',
  '+971556515839',
]

async function deleteTestNumberData() {
  console.log('🗑️  Starting deletion of test number data...\n')

  for (const phone of TEST_NUMBERS) {
    console.log(`\n📱 Processing: ${phone}`)
    
    // Normalize phone number
    const normalized = normalizeToE164(phone)
    console.log(`   Normalized: ${normalized}`)

    // Find all contacts with this phone number (check both phone and phoneNormalized)
    const contacts = await prisma.contact.findMany({
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

    console.log(`   Found ${contacts.length} contact(s)`)

    if (contacts.length === 0) {
      console.log(`   ⚠️  No contacts found for ${phone}`)
      continue
    }

    for (const contact of contacts) {
      console.log(`\n   🗑️  Deleting contact: ${contact.fullName || 'Unknown'} (ID: ${contact.id})`)

      // Get all leads for this contact
      const leads = await prisma.lead.findMany({
        where: { contactId: contact.id },
        select: { id: true },
      })
      console.log(`      Found ${leads.length} lead(s)`)

      // Get all conversations for this contact
      const conversations = await prisma.conversation.findMany({
        where: { contactId: contact.id },
        select: { id: true },
      })
      console.log(`      Found ${conversations.length} conversation(s)`)

      // Delete in order to respect foreign key constraints

      // 1. Delete messages for all conversations
      for (const conv of conversations) {
        const messageCount = await prisma.message.deleteMany({
          where: { conversationId: conv.id },
        })
        console.log(`      Deleted ${messageCount.count} message(s) from conversation ${conv.id}`)

        // Delete communication logs
        const logCount = await prisma.communicationLog.deleteMany({
          where: { conversationId: conv.id },
        })
        console.log(`      Deleted ${logCount.count} communication log(s) from conversation ${conv.id}`)

        // Delete outbound message logs
        const outboundCount = await prisma.outboundMessageLog.deleteMany({
          where: { conversationId: conv.id },
        })
        console.log(`      Deleted ${outboundCount.count} outbound message log(s) from conversation ${conv.id}`)
      }

      // 2. Delete conversations
      const convCount = await prisma.conversation.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${convCount.count} conversation(s)`)

      // 3. Delete leads and related data
      for (const lead of leads) {
        // Delete auto reply logs (must be before lead deletion)
        const autoReplyCount = await prisma.autoReplyLog.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${autoReplyCount.count} auto reply log(s) for lead ${lead.id}`)

        // Delete tasks
        const taskCount = await prisma.task.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${taskCount.count} task(s) for lead ${lead.id}`)

        // Delete documents
        const docCount = await prisma.document.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${docCount.count} document(s) for lead ${lead.id}`)

        // Delete reminders
        const reminderCount = await prisma.reminder.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${reminderCount.count} reminder(s) for lead ${lead.id}`)

        // Delete automation run logs
        const automationCount = await prisma.automationRunLog.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${automationCount.count} automation run log(s) for lead ${lead.id}`)

        // Delete AI drafts
        const draftCount = await prisma.aIDraft.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${draftCount.count} AI draft(s) for lead ${lead.id}`)

        // Delete AI action logs
        const aiActionCount = await prisma.aIActionLog.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${aiActionCount.count} AI action log(s) for lead ${lead.id}`)

        // Delete notifications
        const notificationCount = await prisma.notification.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${notificationCount.count} notification(s) for lead ${lead.id}`)

        // Delete expiry items linked to this lead
        const expiryCount = await prisma.expiryItem.updateMany({
          where: { leadId: lead.id },
          data: { leadId: null }, // Set to null instead of deleting (expiry items may be linked to contact)
        })
        console.log(`      Unlinked ${expiryCount.count} expiry item(s) from lead ${lead.id}`)

        // Delete messages linked to lead
        const leadMessageCount = await prisma.message.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${leadMessageCount.count} message(s) linked to lead ${lead.id}`)

        // Delete communication logs linked to lead
        const leadLogCount = await prisma.communicationLog.deleteMany({
          where: { leadId: lead.id },
        })
        console.log(`      Deleted ${leadLogCount.count} communication log(s) linked to lead ${lead.id}`)
      }

      // Delete leads
      const leadCount = await prisma.lead.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${leadCount.count} lead(s)`)

      // 4. Delete expiry items for this contact
      const expiryCount = await prisma.expiryItem.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${expiryCount.count} expiry item(s)`)

      // 5. Delete chat messages
      const chatMessageCount = await prisma.chatMessage.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${chatMessageCount.count} chat message(s)`)

      // 6. Delete automation run logs
      const automationCount = await prisma.automationRunLog.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${automationCount.count} automation run log(s)`)

      // 7. Delete AI action logs (by contactId)
      const aiActionCount = await prisma.aIActionLog.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${aiActionCount.count} AI action log(s) by contactId`)

      // 8. Delete AI drafts (by contactId)
      const draftCount = await prisma.aIDraft.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${draftCount.count} AI draft(s) by contactId`)

      // 9. Delete auto reply logs (by contactId - already deleted by leadId above, but check anyway)
      const autoReplyCount = await prisma.autoReplyLog.deleteMany({
        where: { contactId: contact.id },
      })
      console.log(`      Deleted ${autoReplyCount.count} auto reply log(s) by contactId`)

      // 10. Finally, delete the contact
      await prisma.contact.delete({
        where: { id: contact.id },
      })
      console.log(`      ✅ Deleted contact ${contact.id}`)
    }
  }

  console.log('\n✅ Deletion complete!')
}

// Run if called directly
if (require.main === module) {
  deleteTestNumberData()
    .then(() => {
      console.log('\n🎉 All test number data deleted successfully!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Error deleting test number data:', error)
      process.exit(1)
    })
}

export { deleteTestNumberData }

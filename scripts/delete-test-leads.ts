/**
 * Script to delete test leads and all related data for specific phone numbers
 * 
 * Usage: npx tsx scripts/delete-test-leads.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TEST_PHONE_NUMBERS = [
  '+971507042270',
  '+971556515839',
]

async function deleteTestLeads() {
  console.log('🗑️ Starting deletion of test leads...')
  console.log('Phone numbers to delete:', TEST_PHONE_NUMBERS)

  try {
    // Find contacts by phone numbers (try various formats)
    const phoneVariations = TEST_PHONE_NUMBERS.flatMap(phone => [
      phone,
      phone.replace('+', ''),
      phone.replace('+971', '0'),
      phone.replace('+971', ''),
    ])

    console.log('📞 Searching for contacts with phone variations:', phoneVariations)

    // Find contacts first (simple query to avoid schema issues)
    const contacts = await prisma.contact.findMany({
      where: {
        OR: phoneVariations.map(phone => ({
          phone: {
            contains: phone,
          },
        })),
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
      },
    })

    if (contacts.length === 0) {
      console.log('✅ No contacts found with those phone numbers')
      return
    }

    console.log(`📋 Found ${contacts.length} contact(s) to delete`)

    for (const contact of contacts) {
      console.log(`\n🗑️ Deleting contact: ${contact.fullName} (${contact.phone})`)
      
      const contactId = contact.id

      // Delete in transaction to ensure data integrity
      await prisma.$transaction(async (tx) => {

        // Get conversation IDs for this contact
        const conversations = await tx.conversation.findMany({
          where: { contactId: contactId },
          select: { id: true },
        })
        const conversationIds = conversations.map(c => c.id)
        
        // Get all message IDs for this contact
        const allMessages = await tx.message.findMany({
          where: {
            OR: [
              { contactId: contactId },
              { conversationId: { in: conversationIds } },
            ],
          },
          select: { id: true },
        })
        const messageIds = allMessages.map(m => m.id)
        
        // Get lead IDs for this contact
        const leads = await tx.lead.findMany({
          where: { contactId: contactId },
          select: { id: true },
        })
        const leadIds = leads.map(l => l.id)

        // 1. Delete message status events
        if (messageIds.length > 0 || conversationIds.length > 0) {
          await tx.messageStatusEvent.deleteMany({
            where: {
              OR: [
                ...(messageIds.length > 0 ? [{ messageId: { in: messageIds } }] : []),
                ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
              ],
            },
          })
          console.log(`   ✅ Deleted message status events`)
        }

        // 2. Delete messages
        await tx.message.deleteMany({
          where: {
            OR: [
              { contactId: contactId },
              ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
            ],
          },
        })
        console.log(`   ✅ Deleted messages`)

        // 3. Delete communication logs
        await tx.communicationLog.deleteMany({
          where: {
            OR: [
              ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
              ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
            ],
          },
        })
        console.log(`   ✅ Deleted communication logs`)

        // 4. Delete AI drafts
        await tx.aIDraft.deleteMany({
          where: {
            OR: [
              ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
              { contactId: contactId },
            ],
          },
        })
        console.log(`   ✅ Deleted AI drafts`)

        // 5. Delete AI action logs
        await tx.aIActionLog.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted AI action logs`)

        // 6. Delete auto reply logs
        await tx.autoReplyLog.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted auto reply logs`)

        // 7. Delete tasks
        await tx.task.deleteMany({
          where: {
            OR: [
              ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
              ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
            ],
          },
        })
        console.log(`   ✅ Deleted tasks`)

        // 8. Delete notifications (if model exists)
        try {
          await tx.notification.deleteMany({
            where: {
              OR: [
                ...(leadIds.length > 0 ? [{ leadId: { in: leadIds } }] : []),
                ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : []),
              ],
            },
          })
          console.log(`   ✅ Deleted notifications`)
        } catch (e: any) {
          if (e.code === 'P2021' || e.code === 'P2001') {
            console.log(`   ⚠️ Notifications table doesn't exist, skipping`)
          } else {
            throw e
          }
        }

        // 9. Delete documents
        if (leadIds.length > 0) {
          await tx.document.deleteMany({
            where: {
              leadId: { in: leadIds },
            },
          })
        }
        console.log(`   ✅ Deleted documents`)

        // 10. Delete expiry items
        await tx.expiryItem.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted expiry items`)

        // 11. Delete inbound/outbound message dedup records (if models exist)
        if (conversationIds.length > 0) {
          try {
            await tx.inboundMessageDedup.deleteMany({
              where: {
                conversationId: { in: conversationIds },
              },
            })
            console.log(`   ✅ Deleted inbound message dedup records`)
          } catch (e: any) {
            if (e.code === 'P2021' || e.code === 'P2001') {
              console.log(`   ⚠️ InboundMessageDedup table doesn't exist, skipping`)
            } else {
              throw e
            }
          }

          // 12. Delete outbound message logs (if model exists)
          try {
            await tx.outboundMessageLog.deleteMany({
              where: {
                conversationId: { in: conversationIds },
              },
            })
            console.log(`   ✅ Deleted outbound message logs`)
          } catch (e: any) {
            if (e.code === 'P2021' || e.code === 'P2001') {
              console.log(`   ⚠️ OutboundMessageLog table doesn't exist, skipping`)
            } else {
              throw e
            }
          }
        }

        // 13. Delete chat messages
        try {
          await tx.chatMessage.deleteMany({
            where: {
              contactId: contactId,
            },
          })
          console.log(`   ✅ Deleted chat messages`)
        } catch (e: any) {
          console.warn(`   ⚠️ Could not delete chat messages: ${e.message}`)
        }

        // 14. Delete conversations
        await tx.conversation.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted conversations`)

        // 15. Delete leads
        await tx.lead.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted leads`)

        // 16. Delete automation run logs
        await tx.automationRunLog.deleteMany({
          where: {
            contactId: contactId,
          },
        })
        console.log(`   ✅ Deleted automation run logs`)

        // 17. Finally, delete the contact
        await tx.contact.delete({
          where: {
            id: contactId,
          },
        })
        console.log(`   ✅ Deleted contact`)
      })

      console.log(`   ✅ Successfully deleted all data for contact ${contact.id}`)
    }

    console.log(`\n✅ Successfully deleted all test leads and related data`)
  } catch (error: any) {
    console.error('❌ Error deleting test leads:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the script
deleteTestLeads()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })


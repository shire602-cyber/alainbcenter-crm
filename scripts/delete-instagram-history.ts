/**
 * Delete all Instagram DM history from the database
 * 
 * This script removes:
 * - All Instagram messages (Message table)
 * - All Instagram conversations (Conversation table)
 * - Related message status events
 * - Related auto-reply logs
 * - Related webhook events
 * - Instagram-specific contact fields (igUsername, igUserId) - optional
 * 
 * Usage:
 *   npx tsx scripts/delete-instagram-history.ts
 * 
 * WARNING: This is irreversible! Make sure you have a backup.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗑️  Starting Instagram DM history deletion...\n')
  console.log('⚠️  WARNING: This will permanently delete all Instagram messages and conversations!\n')

  try {
    // Step 1: Count Instagram messages
    const messageCount = await prisma.message.count({
      where: {
        OR: [
          { channel: 'instagram' },
          { channel: 'INSTAGRAM' },
        ],
      },
    })

    // Step 2: Count Instagram conversations
    const conversationCount = await prisma.conversation.count({
      where: {
        OR: [
          { channel: 'instagram' },
          { channel: 'INSTAGRAM' },
        ],
      },
    })

    // Step 3: Count related data
    const conversationIds = await prisma.conversation.findMany({
      where: {
        OR: [
          { channel: 'instagram' },
          { channel: 'INSTAGRAM' },
        ],
      },
      select: { id: true },
    })
    const convIds = conversationIds.map(c => c.id)

    const messageIds = await prisma.message.findMany({
      where: {
        OR: [
          { channel: 'instagram' },
          { channel: 'INSTAGRAM' },
        ],
      },
      select: { id: true },
    })
    const msgIds = messageIds.map(m => m.id)

    // Count related records
    const statusEventCount = convIds.length > 0 || msgIds.length > 0
      ? await prisma.messageStatusEvent.count({
          where: {
            OR: [
              { messageId: { in: msgIds } },
              { conversationId: { in: convIds } },
            ],
          },
        })
      : 0

    const autoReplyLogCount = convIds.length > 0
      ? await (prisma as any).autoReplyLog.count({
          where: {
            conversationId: { in: convIds },
          },
        }).catch(() => 0)
      : 0

    const webhookEventCount = await (prisma as any).metaWebhookEvent.count({
      where: {
        OR: [
          { object: 'instagram' },
          { object: 'INSTAGRAM' },
        ],
      },
    }).catch(() => 0)

    console.log('📊 Summary of data to be deleted:')
    console.log(`   - Messages: ${messageCount}`)
    console.log(`   - Conversations: ${conversationCount}`)
    console.log(`   - Message Status Events: ${statusEventCount}`)
    console.log(`   - Auto Reply Logs: ${autoReplyLogCount}`)
    console.log(`   - Webhook Events: ${webhookEventCount}`)
    console.log('')

    if (messageCount === 0 && conversationCount === 0) {
      console.log('✅ No Instagram data found. Nothing to delete.')
      return
    }

    // Step 4: Delete in correct order (respecting foreign keys)
    console.log('🗑️  Deleting Instagram data...\n')

    // Delete message status events first (references messages)
    if (statusEventCount > 0) {
      console.log(`   Deleting ${statusEventCount} message status events...`)
      await prisma.messageStatusEvent.deleteMany({
        where: {
          OR: [
            { messageId: { in: msgIds } },
            { conversationId: { in: convIds } },
          ],
        },
      })
      console.log('   ✅ Message status events deleted')
    }

    // Delete auto-reply logs (references conversations)
    if (autoReplyLogCount > 0) {
      console.log(`   Deleting ${autoReplyLogCount} auto-reply logs...`)
      try {
        await (prisma as any).autoReplyLog.deleteMany({
          where: {
            conversationId: { in: convIds },
          },
        })
        console.log('   ✅ Auto-reply logs deleted')
      } catch (error: any) {
        console.warn(`   ⚠️  Could not delete auto-reply logs: ${error.message}`)
      }
    }

    // Delete messages (references conversations)
    if (messageCount > 0) {
      console.log(`   Deleting ${messageCount} messages...`)
      await prisma.message.deleteMany({
        where: {
          OR: [
            { channel: 'instagram' },
            { channel: 'INSTAGRAM' },
          ],
        },
      })
      console.log('   ✅ Messages deleted')
    }

    // Delete conversations (references contacts/leads)
    if (conversationCount > 0) {
      console.log(`   Deleting ${conversationCount} conversations...`)
      await prisma.conversation.deleteMany({
        where: {
          OR: [
            { channel: 'instagram' },
            { channel: 'INSTAGRAM' },
          ],
        },
      })
      console.log('   ✅ Conversations deleted')
    }

    // Delete webhook events (optional - these are just logs)
    if (webhookEventCount > 0) {
      console.log(`   Deleting ${webhookEventCount} webhook events...`)
      try {
        await (prisma as any).metaWebhookEvent.deleteMany({
          where: {
            OR: [
              { object: 'instagram' },
              { object: 'INSTAGRAM' },
            ],
          },
        })
        console.log('   ✅ Webhook events deleted')
      } catch (error: any) {
        console.warn(`   ⚠️  Could not delete webhook events: ${error.message}`)
      }
    }

    // Optional: Clear Instagram-specific contact fields
    console.log('\n   Clearing Instagram contact fields (igUsername, igUserId)...')
    try {
      const contactUpdateCount = await prisma.contact.updateMany({
        where: {
          OR: [
            { igUsername: { not: null } },
            { igUserId: { not: null } },
          ],
        },
        data: {
          igUsername: null,
          igUserId: null,
        },
      })
      console.log(`   ✅ Cleared Instagram fields from ${contactUpdateCount.count} contacts`)
    } catch (error: any) {
      console.warn(`   ⚠️  Could not clear contact fields: ${error.message}`)
    }

    console.log('\n✅ Instagram DM history deletion completed!')
    console.log('\n📝 Note: Contacts and Leads are preserved (only Instagram messages/conversations were deleted)')

  } catch (error: any) {
    console.error('❌ Error deleting Instagram history:', error.message)
    console.error('Stack:', error.stack)
    throw error
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

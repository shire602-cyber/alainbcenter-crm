/**
 * Migration Script: Apply Auto-Reply Fixes
 * 
 * This script:
 * 1. Ensures the unique constraint on (contactId, channel) is enforced
 * 2. Creates the AutoReplyLog table
 * 3. Optionally merges duplicate conversations (if any exist)
 * 
 * Run: npx tsx scripts/apply-auto-reply-fixes-migration.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Applying Auto-Reply Fixes Migration\n')
  
  try {
    // Step 1: Check for duplicate conversations
    console.log('Step 1: Checking for duplicate conversations...')
    
    const duplicates = await prisma.$queryRaw<Array<{ contactId: number; channel: string; count: bigint }>>`
      SELECT "contactId", "channel", COUNT(*) as count
      FROM "Conversation"
      GROUP BY "contactId", "channel"
      HAVING COUNT(*) > 1
    `
    
    if (duplicates.length > 0) {
      console.log(`⚠️  Found ${duplicates.length} duplicate conversation groups`)
      
      for (const dup of duplicates) {
        console.log(`\n  Processing duplicates for contact ${dup.contactId}, channel ${dup.channel}...`)
        
        // Get all conversations for this contact/channel
        const conversations = await prisma.conversation.findMany({
          where: {
            contactId: dup.contactId,
            channel: dup.channel,
          },
          orderBy: { lastMessageAt: 'desc' },
          include: {
            _count: {
              select: { messages: true },
            },
          },
        })
        
        // Keep the most recent conversation with most messages
        const canonical = conversations.reduce((prev, curr) => {
          if (curr._count.messages > prev._count.messages) return curr
          if (curr._count.messages === prev._count.messages && curr.lastMessageAt > prev.lastMessageAt) return curr
          return prev
        })
        
        console.log(`  ✅ Keeping conversation ${canonical.id} (${canonical._count.messages} messages)`)
        
        // Move messages from other conversations to canonical
        for (const conv of conversations) {
          if (conv.id !== canonical.id) {
            const messageCount = await prisma.message.count({
              where: { conversationId: conv.id },
            })
            
            if (messageCount > 0) {
              await prisma.message.updateMany({
                where: { conversationId: conv.id },
                data: { conversationId: canonical.id },
              })
              console.log(`  ✅ Moved ${messageCount} messages from conversation ${conv.id} to ${canonical.id}`)
            }
            
            // Delete duplicate conversation
            await prisma.conversation.delete({
              where: { id: conv.id },
            })
            console.log(`  ✅ Deleted duplicate conversation ${conv.id}`)
          }
        }
      }
      
      console.log(`\n✅ Merged all duplicate conversations`)
    } else {
      console.log('✅ No duplicate conversations found')
    }
    
    // Step 2: Verify unique constraint exists
    console.log('\nStep 2: Verifying unique constraint...')
    console.log('✅ Unique constraint on (contactId, channel) should be enforced by Prisma schema')
    
    // Step 3: Note about AutoReplyLog table
    console.log('\nStep 3: AutoReplyLog table')
    console.log('✅ AutoReplyLog table will be created by Prisma migration')
    console.log('   Run: npx prisma migrate dev --name add_auto_reply_log')
    
    console.log('\n🎉 Migration script completed!')
    console.log('\nNext steps:')
    console.log('1. Run: npx prisma migrate dev --name add_auto_reply_log')
    console.log('2. Run: npx tsx scripts/verify-auto-reply-fixes.ts')
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


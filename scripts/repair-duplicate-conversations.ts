/**
 * REPAIR DUPLICATE CONVERSATIONS
 * 
 * One-time script to fix existing duplicate conversations:
 * - Finds contacts with >1 conversation for same channel (case-insensitive)
 * - Picks canonical conversation (latest lastMessageAt)
 * - Reassigns messages to canonical conversationId
 * - Deletes duplicate conversations
 * 
 * Usage:
 *   npx tsx scripts/repair-duplicate-conversations.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function repairDuplicateConversations() {
  console.log('🔍 [REPAIR] Starting duplicate conversation repair...')

  // Step 1: Find case-insensitive duplicates using raw SQL
  const duplicateGroups = await prisma.$queryRaw<Array<{
    contactId: number
    normalized_channel: string
    count: bigint
  }>>`
    SELECT "contactId", LOWER(channel) as normalized_channel, COUNT(*) as count
    FROM "Conversation"
    GROUP BY "contactId", LOWER(channel)
    HAVING COUNT(*) > 1
  `

  if (duplicateGroups.length === 0) {
    console.log('✅ [REPAIR] No duplicates found - all good!')
    return
  }

  console.log(`📊 [REPAIR] Found ${duplicateGroups.length} duplicate groups`)

  // Step 2: For each duplicate group, fetch all conversations
  const groups = new Map<string, any[]>()
  
  for (const group of duplicateGroups) {
    const conversations = await prisma.conversation.findMany({
      where: {
        contactId: group.contactId,
        channel: {
          in: [group.normalized_channel, group.normalized_channel.toUpperCase(), group.normalized_channel.charAt(0).toUpperCase() + group.normalized_channel.slice(1)],
        },
      },
      select: {
        id: true,
        contactId: true,
        channel: true,
        lastMessageAt: true,
        createdAt: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    })
    
    const key = `${group.contactId}:${group.normalized_channel}`
    groups.set(key, conversations)
  }

  // Step 3: Process each duplicate group
  const duplicates: Array<{
    key: string
    conversations: any[]
    canonical: any
    duplicates: any[]
  }> = []

  for (const [key, convs] of groups.entries()) {
    if (convs.length > 1) {
      // Pick canonical: latest lastMessageAt, or latest createdAt if no messages
      const canonical = convs.reduce((best, current) => {
        const bestTime = best.lastMessageAt || best.createdAt
        const currentTime = current.lastMessageAt || current.createdAt
        return currentTime > bestTime ? current : best
      })
      
      const duplicateConvs = convs.filter(c => c.id !== canonical.id)
      
      duplicates.push({
        key,
        conversations: convs,
        canonical,
        duplicates: duplicateConvs,
      })
    }
  }

  console.log(`📊 [REPAIR] Found ${duplicates.length} duplicate groups to repair`)

  if (duplicates.length === 0) {
    console.log('✅ [REPAIR] No duplicates found - all good!')
    return
  }

  // Step 4: Repair each duplicate group
  let repaired = 0
  let messagesReassigned = 0
  let conversationsDeleted = 0

  for (const group of duplicates) {
    console.log(`\n🔧 [REPAIR] Processing group: ${group.key}`)
    console.log(`   Canonical: conversation ${group.canonical.id} (${group.canonical._count.messages} messages)`)
    console.log(`   Duplicates: ${group.duplicates.map(d => `${d.id} (${d._count.messages} messages)`).join(', ')}`)

    try {
      await prisma.$transaction(async (tx) => {
        // Reassign messages from duplicates to canonical
        for (const dup of group.duplicates) {
          const messageCount = await tx.message.updateMany({
            where: { conversationId: dup.id },
            data: { conversationId: group.canonical.id },
          })
          messagesReassigned += messageCount.count
          console.log(`   ✅ Reassigned ${messageCount.count} messages from conversation ${dup.id}`)

          // Reassign other related records
          await tx.communicationLog.updateMany({
            where: { conversationId: dup.id },
            data: { conversationId: group.canonical.id },
          })

          await tx.task.updateMany({
            where: { conversationId: dup.id },
            data: { conversationId: group.canonical.id },
          })

          await tx.notification.updateMany({
            where: { conversationId: dup.id },
            data: { conversationId: group.canonical.id },
          })

          // Delete OutboundMessageLog records first (foreign key constraint)
          await (tx as any).outboundMessageLog.deleteMany({
            where: { conversationId: dup.id },
          })

          // Delete duplicate conversation
          await tx.conversation.delete({
            where: { id: dup.id },
          })
          conversationsDeleted++
          console.log(`   ✅ Deleted duplicate conversation ${dup.id}`)
        }

        // Update canonical conversation channel to lowercase (if not already)
        const canonicalChannel = group.canonical.channel.toLowerCase()
        if (canonicalChannel !== group.canonical.channel) {
          await tx.conversation.update({
            where: { id: group.canonical.id },
            data: { channel: canonicalChannel },
          })
          console.log(`   ✅ Normalized canonical conversation channel to lowercase`)
        }
      })

      repaired++
    } catch (error: any) {
      console.error(`   ❌ Failed to repair group ${group.key}:`, error.message)
    }
  }

  console.log(`\n✅ [REPAIR] Repair complete:`)
  console.log(`   Groups repaired: ${repaired}/${duplicates.length}`)
  console.log(`   Messages reassigned: ${messagesReassigned}`)
  console.log(`   Conversations deleted: ${conversationsDeleted}`)
}

async function main() {
  try {
    await repairDuplicateConversations()
  } catch (error: any) {
    console.error('❌ [REPAIR] Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


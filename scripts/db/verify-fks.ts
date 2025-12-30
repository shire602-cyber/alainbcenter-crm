#!/usr/bin/env tsx
/**
 * TASK 4: Foreign Key Verification Script
 * 
 * Checks FK constraints and dependent row counts for a conversationId.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." CONVERSATION_ID=123 npx tsx scripts/db/verify-fks.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const conversationId = process.env.CONVERSATION_ID ? parseInt(process.env.CONVERSATION_ID) : null

  if (!conversationId) {
    console.error('❌ CONVERSATION_ID environment variable is required')
    console.error('Usage: CONVERSATION_ID=123 npx tsx scripts/db/verify-fks.ts')
    process.exit(1)
  }

  console.log(`🔍 Verifying foreign key constraints for conversationId=${conversationId}...\n`)

  try {
    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, deletedAt: true },
    })

    if (!conversation) {
      console.error(`❌ Conversation ${conversationId} not found`)
      process.exit(1)
    }

    console.log(`✅ Conversation ${conversationId} exists`)
    if (conversation.deletedAt) {
      console.log(`   Status: SOFT DELETED (deletedAt: ${conversation.deletedAt})`)
    } else {
      console.log(`   Status: ACTIVE`)
    }
    console.log('')

    // Count dependent rows
    const [outboundJobs, outboundMessageLogs, messages, tasks, notifications] = await Promise.all([
      prisma.outboundJob.count({
        where: { conversationId },
      }),
      prisma.outboundMessageLog.count({
        where: { conversationId },
      }),
      prisma.message.count({
        where: { conversationId },
      }),
      prisma.task.count({
        where: { conversationId },
      }),
      prisma.notification.count({
        where: { conversationId },
      }),
    ])

    console.log('📊 Dependent row counts:')
    console.log(`   OutboundJob: ${outboundJobs}`)
    console.log(`   OutboundMessageLog: ${outboundMessageLogs}`)
    console.log(`   Message: ${messages}`)
    console.log(`   Task: ${tasks}`)
    console.log(`   Notification: ${notifications}`)
    console.log('')

    const totalDependent = outboundJobs + outboundMessageLogs + messages + tasks + notifications
    console.log(`📈 Total dependent rows: ${totalDependent}`)

    if (totalDependent > 0) {
      console.log('\n⚠️  WARNING: This conversation has dependent rows.')
      console.log('   Hard delete would violate foreign key constraints.')
      console.log('   Use soft delete (set deletedAt) instead.')
    } else {
      console.log('\n✅ No dependent rows - safe to hard delete (if needed)')
    }

    // Check FK constraints exist
    try {
      const fkConstraints = await prisma.$queryRaw<Array<{
        constraint_name: string
        table_name: string
        column_name: string
      }>>`
        SELECT 
          tc.constraint_name,
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'conversationId'
          AND tc.table_name IN ('OutboundJob', 'OutboundMessageLog', 'Message', 'Task', 'Notification')
        ORDER BY tc.table_name
      `

      console.log('\n🔗 Foreign key constraints:')
      if (fkConstraints.length === 0) {
        console.warn('   ⚠️  No FK constraints found (unexpected)')
      } else {
        fkConstraints.forEach((fk) => {
          console.log(`   ✅ ${fk.table_name}.${fk.column_name} -> Conversation.id`)
        })
      }
    } catch (error: any) {
      console.warn('⚠️  Error checking FK constraints:', error.message)
    }

    process.exit(0)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
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


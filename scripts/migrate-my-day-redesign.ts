/**
 * MIGRATION: My Day & Notifications Redesign
 * 
 * 1. Backfill existing tasks into new structure (deduplicate)
 * 2. Clean up legacy "Complex Query" tasks
 * 3. Update notification types
 * 4. Remove duplicate notifications
 */

import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting My Day & Notifications Redesign Migration...\n')

  // Step 1: Deduplicate tasks (keep only one per lead per type per day)
  console.log('📋 Step 1: Deduplicating tasks...')
  const tasks = await prisma.task.findMany({
    where: {
      status: 'OPEN',
    },
    orderBy: { createdAt: 'desc' },
  })

  const seen = new Map<string, number>()
  let duplicatesRemoved = 0

  for (const task of tasks) {
    const dateKey = task.dueAt ? format(task.dueAt, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
    const key = `${task.leadId}_${task.type}_${dateKey}`
    
    if (seen.has(key)) {
      // Mark duplicate as done
      await prisma.task.update({
        where: { id: task.id },
        data: {
          status: 'DONE',
          doneAt: new Date(),
        },
      })
      duplicatesRemoved++
    } else {
      seen.set(key, task.id)
    }
  }

  console.log(`✅ Removed ${duplicatesRemoved} duplicate tasks\n`)

  // Step 2: Remove legacy "Complex Query" tasks
  console.log('🗑️  Step 2: Removing legacy "Complex Query" tasks...')
  const complexQueryTasks = await prisma.task.findMany({
    where: {
      type: 'ESCALATION',
      title: {
        contains: 'Complex Query',
      },
      status: 'OPEN',
    },
  })

  for (const task of complexQueryTasks) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        doneAt: new Date(),
      },
    })
  }

  console.log(`✅ Removed ${complexQueryTasks.length} legacy "Complex Query" tasks\n`)

  // Step 3: Clean up old notifications (older than 7 days)
  console.log('🧹 Step 3: Cleaning up old notifications...')
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  
  const deleted = await prisma.notification.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
      isRead: true,
    },
  })

  console.log(`✅ Deleted ${deleted.count} old notifications\n`)

  // Step 4: Deduplicate notifications (same type + leadId within 24h)
  console.log('🔄 Step 4: Deduplicating notifications...')
  const notifications = await prisma.notification.findMany({
    where: {
      isRead: false,
    },
    orderBy: { createdAt: 'desc' },
  })

  const notificationSeen = new Map<string, number>()
  let notificationDuplicatesRemoved = 0

  for (const notif of notifications) {
    const key = `${notif.type}_${notif.leadId || 0}_${notif.conversationId || 0}`
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    if (notif.createdAt > oneDayAgo) {
      if (notificationSeen.has(key)) {
        // Mark duplicate as read
        await prisma.notification.update({
          where: { id: notif.id },
          data: {
            isRead: true,
            readAt: new Date(),
          },
        })
        notificationDuplicatesRemoved++
      } else {
        notificationSeen.set(key, notif.id)
      }
    }
  }

  console.log(`✅ Removed ${notificationDuplicatesRemoved} duplicate notifications\n`)

  // Step 5: Update notification types to new format
  console.log('📝 Step 5: Updating notification types...')
  const typeMappings: Record<string, string> = {
    'ai_untrained': 'system',
    'unreplied_message': 'sla_breach_imminent',
    'task_assigned': 'deadline_today',
  }

  for (const [oldType, newType] of Object.entries(typeMappings)) {
    const updated = await prisma.notification.updateMany({
      where: {
        type: oldType,
      },
      data: {
        type: newType,
      },
    })
    console.log(`  Updated ${updated.count} notifications from ${oldType} to ${newType}`)
  }

  console.log('\n✅ Migration completed successfully!')
  console.log(`\nSummary:`)
  console.log(`  - Removed ${duplicatesRemoved} duplicate tasks`)
  console.log(`  - Removed ${complexQueryTasks.length} legacy tasks`)
  console.log(`  - Deleted ${deleted.count} old notifications`)
  console.log(`  - Removed ${notificationDuplicatesRemoved} duplicate notifications`)
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


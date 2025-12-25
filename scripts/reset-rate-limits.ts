/**
 * Reset rate limits in database
 * Clears lastAutoReplyAt for leads that might be stuck
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🔄 Resetting rate limits...\n')
  
  try {
    // Find leads with lastAutoReplyAt set in the last hour (might be blocking new replies)
    const leadsWithRecentReplies = await prisma.lead.findMany({
      where: {
        // @ts-ignore
        lastAutoReplyAt: {
          not: null,
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      select: {
        id: true,
        // @ts-ignore
        lastAutoReplyAt: true,
        contact: {
          select: {
            phone: true,
            fullName: true,
          },
        },
      },
      take: 50,
    })
    
    console.log(`Found ${leadsWithRecentReplies.length} leads with recent auto-replies\n`)
    
    if (leadsWithRecentReplies.length > 0) {
      // Reset lastAutoReplyAt for these leads to allow new replies
      const leadIds = leadsWithRecentReplies.map(l => l.id)
      
      await prisma.lead.updateMany({
        where: {
          id: { in: leadIds },
        },
        data: {
          // @ts-ignore
          lastAutoReplyAt: null,
        },
      })
      
      console.log(`✅ Reset lastAutoReplyAt for ${leadIds.length} leads`)
      console.log(`   These leads can now receive new replies immediately\n`)
      
      // Show which leads were reset
      leadsWithRecentReplies.forEach(lead => {
        console.log(`   - Lead ${lead.id}: ${lead.contact?.fullName || lead.contact?.phone || 'Unknown'}`)
      })
    }
    
    // Also clean up old AutoReplyLog entries that might be blocking
    const oldSkippedLogs = await (prisma as any).autoReplyLog.findMany({
      where: {
        decision: 'skipped',
        skippedReason: { contains: 'Rate limit' },
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      take: 100,
    })
    
    if (oldSkippedLogs.length > 0) {
      console.log(`\n📊 Found ${oldSkippedLogs.length} rate-limit-skipped logs in last hour`)
      console.log(`   These are just logs - they won't block new messages`)
    }
    
    console.log('\n✅ Rate limit reset complete!')
    console.log('\n⚠️  NOTE: New messages should now get replies immediately')
    console.log('   If messages still don\'t get replies, check:')
    console.log('   1. Is autoReplyEnabled=true for the lead?')
    console.log('   2. Is the lead muted?')
    console.log('   3. Are there any errors in the logs?')
    
  } catch (error: any) {
    console.error('❌ Reset failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


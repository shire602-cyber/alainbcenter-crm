/**
 * Cleanup script to remove stuck AutoReplyLog entries
 * This helps if old entries are blocking new replies
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧹 Cleaning up stuck AutoReplyLog entries...\n')
  
  try {
    // Find logs that are marked as 'processing' or 'skipped' but are old (stuck)
    const stuckLogs = await (prisma as any).autoReplyLog.findMany({
      where: {
        OR: [
          { decision: 'processing' },
          { decision: 'skipped', skippedReason: { contains: 'Duplicate attempt' } },
        ],
        createdAt: {
          lt: new Date(Date.now() - 5 * 60 * 1000), // Older than 5 minutes
        },
      },
      take: 100,
    })
    
    console.log(`Found ${stuckLogs.length} potentially stuck logs\n`)
    
    if (stuckLogs.length > 0) {
      // Update stuck 'processing' logs to 'skipped' with reason
      const processingLogs = stuckLogs.filter((l: any) => l.decision === 'processing')
      if (processingLogs.length > 0) {
        await (prisma as any).autoReplyLog.updateMany({
          where: {
            id: { in: processingLogs.map((l: any) => l.id) },
          },
          data: {
            decision: 'skipped',
            skippedReason: 'Stuck processing - cleaned up by script',
          },
        })
        console.log(`✅ Updated ${processingLogs.length} stuck 'processing' logs`)
      }
      
      // Delete old duplicate attempt logs (they're blocking new messages)
      const duplicateLogs = stuckLogs.filter((l: any) => 
        l.decision === 'skipped' && l.skippedReason?.includes('Duplicate attempt')
      )
      if (duplicateLogs.length > 0) {
        await (prisma as any).autoReplyLog.deleteMany({
          where: {
            id: { in: duplicateLogs.map((l: any) => l.id) },
          },
        })
        console.log(`✅ Deleted ${duplicateLogs.length} old duplicate attempt logs`)
      }
    }
    
    // Check for messages that should have gotten replies but didn't
    const recentInboundMessages = await prisma.message.findMany({
      where: {
        direction: 'INBOUND',
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
        },
      },
      include: {
        conversation: {
          include: {
            lead: true,
          },
        },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    })
    
    console.log(`\n📊 Checking ${recentInboundMessages.length} recent inbound messages...\n`)
    
    for (const msg of recentInboundMessages) {
      if (!msg.conversation?.lead) continue
      
      const leadId = msg.conversation.lead.id
      const messageId = msg.id
      
      // Check if there's a reply log for this message
      const replyLog = await (prisma as any).autoReplyLog.findFirst({
        where: {
          messageId: messageId,
          leadId: leadId,
        },
        orderBy: { createdAt: 'desc' },
      })
      
      // Check if there's an outbound reply after this message
      const hasReply = await prisma.message.findFirst({
        where: {
          conversationId: msg.conversationId,
          direction: 'OUTBOUND',
          createdAt: {
            gte: msg.createdAt,
          },
        },
      })
      
      if (!hasReply && (!replyLog || replyLog.decision !== 'replied')) {
        console.log(`⚠️  Message ${messageId} (lead ${leadId}) has no reply`)
        console.log(`   Text: "${msg.body?.substring(0, 50)}..."`)
        console.log(`   Log: ${replyLog ? `${replyLog.decision} - ${replyLog.skippedReason || replyLog.decisionReason}` : 'none'}\n`)
      }
    }
    
    console.log('\n✅ Cleanup complete!')
    
  } catch (error: any) {
    console.error('❌ Cleanup failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


/**
 * Script to delete all data related to Lead 93
 * WARNING: This is irreversible. Use with caution.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function deleteLead93() {
  console.log('🗑️  Starting deletion of Lead 93 and all related data...')
  
  try {
    // Check if lead exists first
    const lead = await prisma.lead.findUnique({
      where: { id: 93 },
      select: { id: true }
    })
    
    if (!lead) {
      console.log('⚠️  Lead 93 not found. It may have already been deleted.')
      return
    }

    // Execute deletion step by step (not in single transaction to avoid timeouts)
    console.log('Starting deletions...')

    // 1. Get conversation IDs first
    const conversations = await prisma.conversation.findMany({
      where: { leadId: 93 },
      select: { id: true }
    })
    const conversationIds = conversations.map(c => c.id)
    console.log(`📋 Found ${conversationIds.length} conversations for Lead 93`)

    // 2. Delete RenewalEventLog entries (via RenewalItem)
    try {
      const renewalItems = await prisma.renewalItem.findMany({
        where: { leadId: 93 },
        select: { id: true }
      })
      if (renewalItems.length > 0) {
        const deleted = await prisma.renewalEventLog.deleteMany({
          where: { renewalItemId: { in: renewalItems.map(i => i.id) } }
        })
        console.log(`✅ Deleted ${deleted.count} RenewalEventLog entries`)
      }
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  RenewalEventLog table does not exist - skipped')
    }

    // 3. Delete RenewalItem entries
    try {
      const deleted = await prisma.renewalItem.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} RenewalItem entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  RenewalItem table does not exist - skipped')
    }

    // 4. Delete RenewalNotification entries
    try {
      const renewals = await prisma.renewal.findMany({
        where: { leadId: 93 },
        select: { id: true }
      })
      if (renewals.length > 0) {
        const deleted = await prisma.renewalNotification.deleteMany({
          where: { renewalId: { in: renewals.map(r => r.id) } }
        })
        console.log(`✅ Deleted ${deleted.count} RenewalNotification entries`)
      }
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  RenewalNotification table does not exist - skipped')
    }

    // 5. Delete Renewal entries
    try {
      const deleted = await prisma.renewal.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} Renewal entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  Renewal table does not exist - skipped')
    }

    // 6-10. Delete conversation-related entries
    if (conversationIds.length > 0) {
      try {
        const deleted = await prisma.outboundMessageDedup.deleteMany({
          where: { conversationId: { in: conversationIds } }
        })
        console.log(`✅ Deleted ${deleted.count} OutboundMessageDedup entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  OutboundMessageDedup table does not exist - skipped')
      }

      try {
        const deleted = await prisma.aiReplyDedup.deleteMany({
          where: { conversationId: { in: conversationIds } }
        })
        console.log(`✅ Deleted ${deleted.count} AiReplyDedup entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  AiReplyDedup table does not exist - skipped')
      }

      try {
        const deleted = await prisma.outboundJob.deleteMany({
          where: { conversationId: { in: conversationIds } }
        })
        console.log(`✅ Deleted ${deleted.count} OutboundJob entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  OutboundJob table does not exist - skipped')
      }

      try {
        const deleted = await prisma.replyEngineLog.deleteMany({
          where: { conversationId: { in: conversationIds } }
        })
        console.log(`✅ Deleted ${deleted.count} ReplyEngineLog entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  ReplyEngineLog table does not exist - skipped')
      }

      try {
        const deleted = await prisma.outboundMessageLog.deleteMany({
          where: { conversationId: { in: conversationIds } }
        })
        console.log(`✅ Deleted ${deleted.count} OutboundMessageLog entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  OutboundMessageLog table does not exist - skipped')
      }

      // Get message IDs for these conversations
      const messages = await prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { id: true }
      })
      const messageIds = messages.map(m => m.id)

      if (messageIds.length > 0) {
        try {
          const deleted = await prisma.messageStatusEvent.deleteMany({
            where: { messageId: { in: messageIds } }
          })
          console.log(`✅ Deleted ${deleted.count} MessageStatusEvent entries`)
        } catch (e: any) {
          if (e.code !== 'P2021') throw e
          console.log('⚠️  MessageStatusEvent table does not exist - skipped')
        }
      }
    }

    // 11. Delete AutoReplyLog
    try {
      const leadMessages = await prisma.message.findMany({
        where: { leadId: 93 },
        select: { id: true }
      })
      
      const conversationMessages = conversationIds.length > 0 ? await prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        select: { id: true }
      }) : []
      
      const allMessageIds = [...leadMessages, ...conversationMessages].map(m => m.id)
      
      if (allMessageIds.length > 0) {
        const deleted = await prisma.autoReplyLog.deleteMany({
          where: {
            OR: [
              { messageId: { in: allMessageIds } },
              { leadId: 93 }
            ]
          }
        })
        console.log(`✅ Deleted ${deleted.count} AutoReplyLog entries`)
      } else {
        const deleted = await prisma.autoReplyLog.deleteMany({ where: { leadId: 93 } })
        console.log(`✅ Deleted ${deleted.count} AutoReplyLog entries`)
      }
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  AutoReplyLog table does not exist - skipped')
    }

    // 12. Delete LeadAttachment
    try {
      const deleted = await prisma.leadAttachment.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} LeadAttachment entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  LeadAttachment table does not exist - skipped')
    }

    // 13. Delete Message entries
    const deletedMessages = await prisma.message.deleteMany({
      where: {
        OR: [
          { leadId: 93 },
          ...(conversationIds.length > 0 ? [{ conversationId: { in: conversationIds } }] : [])
        ]
      }
    })
    console.log(`✅ Deleted ${deletedMessages.count} Message entries`)

    // 14. Delete Conversation entries
    const deletedConversations = await prisma.conversation.deleteMany({ where: { leadId: 93 } })
    console.log(`✅ Deleted ${deletedConversations.count} Conversation entries`)

    // 15. Delete ChatMessage entries
    try {
      const deleted = await prisma.chatMessage.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} ChatMessage entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  ChatMessage table does not exist - skipped')
    }

    // 16. Delete TaskAssignee (via Task)
    const tasks = await prisma.task.findMany({
      where: { leadId: 93 },
      select: { id: true }
    })
    
    if (tasks.length > 0) {
      try {
        const deleted = await prisma.taskAssignee.deleteMany({
          where: { taskId: { in: tasks.map(t => t.id) } }
        })
        console.log(`✅ Deleted ${deleted.count} TaskAssignee entries`)
      } catch (e: any) {
        if (e.code !== 'P2021') throw e
        console.log('⚠️  TaskAssignee table does not exist - skipped')
      }
    }

    // 17. Delete Task entries
    const deletedTasks = await prisma.task.deleteMany({ where: { leadId: 93 } })
    console.log(`✅ Deleted ${deletedTasks.count} Task entries`)

    // 18. Delete Document entries
    const deletedDocuments = await prisma.document.deleteMany({ where: { leadId: 93 } })
    console.log(`✅ Deleted ${deletedDocuments.count} Document entries`)

    // 19. Delete ChecklistItem entries
    try {
      const deleted = await prisma.checklistItem.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} ChecklistItem entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  ChecklistItem table does not exist - skipped')
    }

    // 20. Delete SentAutomation entries
    try {
      const deleted = await prisma.sentAutomation.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} SentAutomation entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  SentAutomation table does not exist - skipped')
    }

    // 21. Delete AutomationRunLog entries
    try {
      const deleted = await prisma.automationRunLog.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} AutomationRunLog entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  AutomationRunLog table does not exist - skipped')
    }

    // 22. Delete AIDraft entries
    try {
      const deleted = await prisma.aIDraft.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} AIDraft entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  AIDraft table does not exist - skipped')
    }

    // 23. Delete AIActionLog entries
    try {
      const deleted = await prisma.aIActionLog.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} AIActionLog entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  AIActionLog table does not exist - skipped')
    }

    // 24. Delete Notification entries
    try {
      const deleted = await prisma.notification.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} Notification entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  Notification table does not exist - skipped')
    }

    // 25. Delete CommunicationLog entries
    const deletedCommLogs = await prisma.communicationLog.deleteMany({ where: { leadId: 93 } })
    console.log(`✅ Deleted ${deletedCommLogs.count} CommunicationLog entries`)

    // 26. Update ExpiryItem entries (set leadId to NULL, not delete)
    try {
      const updated = await prisma.expiryItem.updateMany({
        where: {
          OR: [
            { leadId: 93 },
            { renewalLeadId: 93 }
          ]
        },
        data: {
          leadId: null,
          renewalLeadId: null
        }
      })
      console.log(`✅ Updated ${updated.count} ExpiryItem entries (set leadId to NULL)`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  ExpiryItem table does not exist - skipped')
    }

    // 27. Delete Reminder entries
    try {
      const deleted = await prisma.reminder.deleteMany({ where: { leadId: 93 } })
      console.log(`✅ Deleted ${deleted.count} Reminder entries`)
    } catch (e: any) {
      if (e.code !== 'P2021') throw e
      console.log('⚠️  Reminder table does not exist - skipped')
    }

    // 28. Finally, delete the Lead itself
    await prisma.lead.delete({
      where: { id: 93 }
    })
    console.log(`✅ Deleted Lead 93`)

    console.log('✅ Successfully deleted Lead 93 and all related data!')
  } catch (error: any) {
    console.error('❌ Error deleting Lead 93:', error.message)
    if (error.code === 'P2025') {
      console.log('⚠️  Lead 93 not found (may have been already deleted)')
    } else {
      throw error
    }
  } finally {
    await prisma.$disconnect()
  }
}

deleteLead93()
  .then(() => {
    console.log('✅ Deletion complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Deletion failed:', error)
    process.exit(1)
  })

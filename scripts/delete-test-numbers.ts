/**
 * Delete all data for test phone numbers
 * WARNING: This permanently deletes data - use with caution
 */

import { prisma } from '../src/lib/prisma'

const TEST_PHONE_NUMBERS = [
  '+971507042270',
  '+971556515839',
  '+260777711059',
]

// Normalize phone numbers (remove spaces, dashes, etc.)
function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '').trim()
}

async function deleteTestNumbers() {
  console.log('🗑️  Starting deletion of test phone numbers...')
  console.log('📱 Test numbers:', TEST_PHONE_NUMBERS.join(', '))
  
  try {
    for (const phone of TEST_PHONE_NUMBERS) {
      const normalized = normalizePhone(phone)
      console.log(`\n🔍 Processing: ${phone} (normalized: ${normalized})`)
      
      // Find all contacts with this phone number (try different formats)
      const phoneVariations = [
        normalized,
        phone,
        phone.replace('+', ''),
        phone.replace('+971', '0'),
        phone.replace('+260', '0'),
      ]
      
      const contacts = await prisma.contact.findMany({
        where: {
          OR: phoneVariations.map(phoneVar => ({
            phone: {
              contains: phoneVar.replace(/[^\d]/g, ''), // Match any format with same digits
            },
          })),
        },
        include: {
          leads: {
            include: {
              conversations: {
                include: {
                  messages: true,
                },
              },
              messages: true,
              documents: true,
              tasks: true,
              communicationLogs: true,
            },
          },
          conversations: {
            include: {
              messages: true,
            },
          },
          chatMessages: true,
        },
      })
      
      if (contacts.length === 0) {
        console.log(`   ⚠️  No contacts found for ${phone}`)
        continue
      }
      
      console.log(`   📋 Found ${contacts.length} contact(s)`)
      
      for (const contact of contacts) {
        console.log(`   🗑️  Deleting contact: ${contact.id} (${contact.fullName || 'No name'})`)
        
        // Delete all related data
        const leadIds = contact.leads.map(l => l.id)
        const conversationIds = contact.conversations.map(c => c.id)
        
        // Delete messages in conversations (need to delete related records first)
        for (const conv of contact.conversations) {
          if (conv.messages.length > 0) {
            const messageIds = conv.messages.map(m => m.id)
            
            // Delete MessageStatusEvent records first
            try {
              await (prisma as any).messageStatusEvent.deleteMany({
                where: {
                  messageId: {
                    in: messageIds,
                  },
                },
              })
            } catch (e) {
              // Table might not exist, ignore
            }
            
            // Now delete messages
            await prisma.message.deleteMany({
              where: {
                conversationId: conv.id,
              },
            })
            console.log(`      ✅ Deleted ${conv.messages.length} messages from conversation ${conv.id}`)
          }
        }
        
        // Delete conversations
        if (contact.conversations.length > 0) {
          await prisma.conversation.deleteMany({
            where: {
              contactId: contact.id,
            },
          })
          console.log(`      ✅ Deleted ${contact.conversations.length} conversation(s)`)
        }
        
        // Delete chat messages
        if (contact.chatMessages && contact.chatMessages.length > 0) {
          await prisma.chatMessage.deleteMany({
            where: {
              contactId: contact.id,
            },
          })
          console.log(`      ✅ Deleted ${contact.chatMessages.length} chat message(s)`)
        }
        
        // Delete expiry items
        if (contact.expiryItems && contact.expiryItems.length > 0) {
          await prisma.expiryItem.deleteMany({
            where: {
              contactId: contact.id,
            },
          })
          console.log(`      ✅ Deleted ${contact.expiryItems.length} expiry item(s)`)
        }
        
        // Delete automation run logs
        if (contact.automationRunLogs && contact.automationRunLogs.length > 0) {
          await prisma.automationRunLog.deleteMany({
            where: {
              contactId: contact.id,
            },
          })
          console.log(`      ✅ Deleted ${contact.automationRunLogs.length} automation log(s)`)
        }
        
        // Delete AI drafts
        if (contact.aiDrafts && contact.aiDrafts.length > 0) {
          await prisma.aIDraft.deleteMany({
            where: {
              contactId: contact.id,
            },
          })
          console.log(`      ✅ Deleted ${contact.aiDrafts.length} AI draft(s)`)
        }
        
        // Delete AI action logs
        try {
          if (contact.aiActionLogs && contact.aiActionLogs.length > 0) {
            await (prisma as any).aiActionLog.deleteMany({
              where: {
                contactId: contact.id,
              },
            })
            console.log(`      ✅ Deleted ${contact.aiActionLogs.length} AI action log(s)`)
          }
        } catch (e) {
          // Ignore errors
        }
        
        // Delete leads and all related data
        for (const lead of contact.leads) {
          console.log(`      🗑️  Deleting lead: ${lead.id}`)
          
          // Delete messages (need to delete related records first)
          if (lead.messages && lead.messages.length > 0) {
            const messageIds = lead.messages.map(m => m.id)
            
            // Delete MessageStatusEvent records first
            try {
              await (prisma as any).messageStatusEvent.deleteMany({
                where: {
                  messageId: {
                    in: messageIds,
                  },
                },
              })
            } catch (e) {
              // Table might not exist, ignore
            }
            
            // Now delete messages
            await prisma.message.deleteMany({
              where: {
                leadId: lead.id,
              },
            })
            console.log(`         ✅ Deleted ${lead.messages.length} message(s)`)
          }
          
          // Delete documents
          if (lead.documents && lead.documents.length > 0) {
            await prisma.document.deleteMany({
              where: {
                leadId: lead.id,
              },
            })
            console.log(`         ✅ Deleted ${lead.documents.length} document(s)`)
          }
          
          // Delete tasks
          if (lead.tasks && lead.tasks.length > 0) {
            await prisma.task.deleteMany({
              where: {
                leadId: lead.id,
              },
            })
            console.log(`         ✅ Deleted ${lead.tasks.length} task(s)`)
          }
          
          // Delete communication logs
          if (lead.communicationLogs && lead.communicationLogs.length > 0) {
            await prisma.communicationLog.deleteMany({
              where: {
                leadId: lead.id,
              },
            })
            console.log(`         ✅ Deleted ${lead.communicationLogs.length} communication log(s)`)
          }
          
          // Delete expiry items
          try {
            const expiryItems = await prisma.expiryItem.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (expiryItems.length > 0) {
              await prisma.expiryItem.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${expiryItems.length} expiry item(s)`)
            }
          } catch (e) {
            // Ignore errors
          }
          
          // Delete reminders
          try {
            const reminders = await prisma.reminder.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (reminders.length > 0) {
              await prisma.reminder.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${reminders.length} reminder(s)`)
            }
          } catch (e) {
            // Ignore errors
          }
          
          // Delete automation run logs
          try {
            const automationLogs = await prisma.automationRunLog.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (automationLogs.length > 0) {
              await prisma.automationRunLog.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${automationLogs.length} automation log(s)`)
            }
          } catch (e) {
            // Ignore errors
          }
          
          // Delete AI drafts
          try {
            const aiDrafts = await prisma.aIDraft.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (aiDrafts.length > 0) {
              await prisma.aIDraft.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${aiDrafts.length} AI draft(s)`)
            }
          } catch (e) {
            // Ignore errors
          }
          
          // Delete AI action logs
          try {
            const aiActionLogs = await (prisma as any).aiActionLog.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (aiActionLogs.length > 0) {
              await (prisma as any).aiActionLog.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${aiActionLogs.length} AI action log(s)`)
            }
          } catch (e) {
            // Ignore errors
          }
          
          // Delete conversations for this lead (if not already deleted)
          if (lead.conversations && lead.conversations.length > 0) {
            for (const conv of lead.conversations) {
              // Check if conversation still exists
              const existingConv = await prisma.conversation.findUnique({
                where: { id: conv.id },
              })
              
              if (!existingConv) {
                console.log(`         ⚠️  Conversation ${conv.id} already deleted, skipping`)
                continue
              }
              
              // Get message IDs first
              const convMessages = await prisma.message.findMany({
                where: {
                  conversationId: conv.id,
                },
                select: { id: true },
              })
              const messageIds = convMessages.map(m => m.id)
              
              // Delete MessageStatusEvent records first
              if (messageIds.length > 0) {
                try {
                  await (prisma as any).messageStatusEvent.deleteMany({
                    where: {
                      messageId: {
                        in: messageIds,
                      },
                    },
                  })
                } catch (e) {
                  // Table might not exist, ignore
                }
              }
              
              // Now delete messages
              await prisma.message.deleteMany({
                where: {
                  conversationId: conv.id,
                },
              })
              
              // Delete conversation (use deleteMany to avoid error if already deleted)
              await prisma.conversation.deleteMany({
                where: {
                  id: conv.id,
                },
              })
              console.log(`         ✅ Deleted conversation ${conv.id}`)
            }
          }
          
          // Delete AutoReplyLog entries
          try {
            const autoReplyLogs = await (prisma as any).autoReplyLog.findMany({
              where: {
                leadId: lead.id,
              },
            })
            if (autoReplyLogs.length > 0) {
              await (prisma as any).autoReplyLog.deleteMany({
                where: {
                  leadId: lead.id,
                },
              })
              console.log(`         ✅ Deleted ${autoReplyLogs.length} auto-reply log(s)`)
            }
          } catch (e) {
            // AutoReplyLog might not exist, ignore
          }
          
          // Delete the lead
          await prisma.lead.delete({
            where: {
              id: lead.id,
            },
          })
          console.log(`         ✅ Deleted lead ${lead.id}`)
        }
        
        // Delete the contact
        await prisma.contact.delete({
          where: {
            id: contact.id,
          },
        })
        console.log(`      ✅ Deleted contact ${contact.id}`)
      }
    }
    
    console.log('\n✅ Deletion complete!')
  } catch (error: any) {
    console.error('❌ Error during deletion:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the deletion
deleteTestNumbers()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })


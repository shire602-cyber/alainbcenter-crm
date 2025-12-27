/**
 * MERGE CONTACTS & CONVERSATIONS SCRIPT
 * 
 * Backfills phoneNormalized, merges duplicate contacts, and consolidates conversations.
 * 
 * Usage:
 *   DRY_RUN=true npx tsx scripts/merge-contacts.ts  # Preview changes
 *   DRY_RUN=false npx tsx scripts/merge-contacts.ts  # Execute merge
 */

import { PrismaClient } from '@prisma/client'
import { normalizePhone } from '../src/lib/phone/normalize'

const prisma = new PrismaClient()
const DRY_RUN = process.env.DRY_RUN !== 'false' // Default to true (safe)

interface MergeStats {
  contactsBackfilled: number
  contactsMerged: number
  conversationsMerged: number
  messagesMoved: number
  leadsUpdated: number
  tasksUpdated: number
  errors: string[]
}

async function main() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`MERGE CONTACTS & CONVERSATIONS SCRIPT`)
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify database)'}`)
  console.log(`${'='.repeat(60)}\n`)

  const stats: MergeStats = {
    contactsBackfilled: 0,
    contactsMerged: 0,
    conversationsMerged: 0,
    messagesMoved: 0,
    leadsUpdated: 0,
    tasksUpdated: 0,
    errors: [],
  }

  try {
    // STEP 1: Backfill phoneNormalized for all contacts
    console.log('📞 Step 1: Backfilling phoneNormalized...')
    const contactsWithoutNormalized = await prisma.contact.findMany({
      where: {
        OR: [
          { phoneNormalized: null },
          { phoneNormalized: '' },
        ],
      },
    })

    console.log(`   Found ${contactsWithoutNormalized.length} contacts without phoneNormalized`)

    for (const contact of contactsWithoutNormalized) {
      try {
        const normalized = normalizePhone(contact.phone, 'AE')
        
        if (!DRY_RUN) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: { phoneNormalized: normalized },
          })
        }
        
        stats.contactsBackfilled++
        if (stats.contactsBackfilled % 100 === 0) {
          console.log(`   Backfilled ${stats.contactsBackfilled} contacts...`)
        }
      } catch (error: any) {
        stats.errors.push(`Failed to normalize phone for contact ${contact.id}: ${error.message}`)
      }
    }

    console.log(`   ✅ Backfilled ${stats.contactsBackfilled} contacts\n`)

    // STEP 2: Find duplicate contacts by phoneNormalized
    console.log('🔍 Step 2: Finding duplicate contacts...')
    const allContacts = await prisma.contact.findMany({
      where: {
        phoneNormalized: { not: null },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first (canonical)
    })

    // Group by phoneNormalized
    const contactsByPhone = new Map<string, typeof allContacts>()
    for (const contact of allContacts) {
      if (!contact.phoneNormalized) continue
      const existing = contactsByPhone.get(contact.phoneNormalized) || []
      existing.push(contact)
      contactsByPhone.set(contact.phoneNormalized, existing)
    }

    // Find duplicates (groups with > 1 contact)
    const duplicateGroups: Array<{ canonical: typeof allContacts[0]; duplicates: typeof allContacts }> = []
    for (const [phone, contacts] of Array.from(contactsByPhone.entries())) {
      if (contacts.length > 1) {
        const [canonical, ...duplicates] = contacts // Oldest is canonical
        duplicateGroups.push({ canonical, duplicates })
      }
    }

    console.log(`   Found ${duplicateGroups.length} groups of duplicate contacts\n`)

    // STEP 3: Merge duplicate contacts
    console.log('🔗 Step 3: Merging duplicate contacts...')
    for (const { canonical, duplicates } of duplicateGroups) {
      console.log(`   Merging ${duplicates.length} duplicates into contact ${canonical.id} (${canonical.phoneNormalized})`)

      for (const duplicate of duplicates) {
        try {
          // Update all foreign keys to point to canonical contact
          if (!DRY_RUN) {
            // Update Leads
            await prisma.lead.updateMany({
              where: { contactId: duplicate.id },
              data: { contactId: canonical.id },
            })
            stats.leadsUpdated += await prisma.lead.count({
              where: { contactId: duplicate.id },
            })

            // Update Conversations
            await prisma.conversation.updateMany({
              where: { contactId: duplicate.id },
              data: { contactId: canonical.id },
            })

            // Update Messages
            await prisma.message.updateMany({
              where: { contactId: duplicate.id },
              data: { contactId: canonical.id },
            })

            // Update Tasks via lead relationship (Tasks don't have contactId, only leadId)
            // Tasks will automatically be associated with canonical contact via lead relationship
            const duplicateLeads = await prisma.lead.findMany({
              where: { contactId: duplicate.id },
              select: { id: true },
            })
            const duplicateLeadIds = duplicateLeads.map(l => l.id)
            
            if (duplicateLeadIds.length > 0) {
              // Count tasks for stats (tasks are already linked via leadId, so no update needed)
              const taskCount = await prisma.task.count({
                where: { leadId: { in: duplicateLeadIds } },
              })
              stats.tasksUpdated += taskCount
            }

            // Update other relations (add more as needed)
            await prisma.expiryItem.updateMany({
              where: { contactId: duplicate.id },
              data: { contactId: canonical.id },
            })

            // CommunicationLog doesn't have contactId, only leadId and conversationId
            // It will be updated via lead relationship (no direct update needed)

            // Merge contact data (prefer canonical, but update if duplicate has better info)
            const updateData: any = {}
            if (duplicate.fullName && !canonical.fullName.includes('Unknown') && canonical.fullName.includes('Unknown')) {
              updateData.fullName = duplicate.fullName
            }
            if (duplicate.email && !canonical.email) {
              updateData.email = duplicate.email
            }
            if (duplicate.nationality && !canonical.nationality) {
              updateData.nationality = duplicate.nationality
            }
            if (duplicate.waId && !canonical.waId) {
              updateData.waId = duplicate.waId
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.contact.update({
                where: { id: canonical.id },
                data: updateData,
              })
            }

            // Delete duplicate contact
            await prisma.contact.delete({
              where: { id: duplicate.id },
            })
          }

          stats.contactsMerged++
        } catch (error: any) {
          stats.errors.push(`Failed to merge contact ${duplicate.id} into ${canonical.id}: ${error.message}`)
        }
      }
    }

    console.log(`   ✅ Merged ${stats.contactsMerged} duplicate contacts\n`)

    // STEP 4: Merge duplicate conversations (same contact+channel)
    console.log('💬 Step 4: Merging duplicate conversations...')
    const allConversations = await prisma.conversation.findMany({
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest first (canonical)
    })

    // Group by contactId + channel
    const conversationsByKey = new Map<string, typeof allConversations>()
    for (const conv of allConversations) {
      const key = `${conv.contactId}_${conv.channel.toLowerCase()}`
      const existing = conversationsByKey.get(key) || []
      existing.push(conv)
      conversationsByKey.set(key, existing)
    }

    // Find duplicates
    for (const [key, conversations] of Array.from(conversationsByKey.entries())) {
      if (conversations.length > 1) {
        // Sort by message count (most messages = canonical) or createdAt (oldest = canonical)
        conversations.sort((a, b) => {
          const countDiff = (b._count.messages || 0) - (a._count.messages || 0)
          if (countDiff !== 0) return countDiff
          return a.createdAt.getTime() - b.createdAt.getTime()
        })

        const [canonical, ...duplicates] = conversations
        console.log(`   Merging ${duplicates.length} duplicate conversations into ${canonical.id} (contact ${canonical.contactId}, channel ${canonical.channel})`)

        for (const duplicate of duplicates) {
          try {
            if (!DRY_RUN) {
              // Move messages to canonical conversation
              const movedCount = await prisma.message.updateMany({
                where: { conversationId: duplicate.id },
                data: { conversationId: canonical.id },
              })
              stats.messagesMoved += movedCount.count

              // Update leadId if canonical doesn't have one
              if (!canonical.leadId && duplicate.leadId) {
                await prisma.conversation.update({
                  where: { id: canonical.id },
                  data: { leadId: duplicate.leadId },
                })
              }

              // Move other relations
              await prisma.task.updateMany({
                where: { conversationId: duplicate.id },
                data: { conversationId: canonical.id },
              })

              await prisma.communicationLog.updateMany({
                where: { conversationId: duplicate.id },
                data: { conversationId: canonical.id },
              })

              await prisma.notification.updateMany({
                where: { conversationId: duplicate.id },
                data: { conversationId: canonical.id },
              })

              // Update canonical conversation timestamps
              await prisma.conversation.update({
                where: { id: canonical.id },
                data: {
                  lastMessageAt: duplicate.lastMessageAt > canonical.lastMessageAt 
                    ? duplicate.lastMessageAt 
                    : canonical.lastMessageAt,
                  lastInboundAt: duplicate.lastInboundAt && (!canonical.lastInboundAt || duplicate.lastInboundAt > canonical.lastInboundAt)
                    ? duplicate.lastInboundAt
                    : canonical.lastInboundAt,
                  lastOutboundAt: duplicate.lastOutboundAt && (!canonical.lastOutboundAt || duplicate.lastOutboundAt > canonical.lastOutboundAt)
                    ? duplicate.lastOutboundAt
                    : canonical.lastOutboundAt,
                },
              })

              // Delete duplicate conversation
              await prisma.conversation.delete({
                where: { id: duplicate.id },
              })
            }

            stats.conversationsMerged++
          } catch (error: any) {
            stats.errors.push(`Failed to merge conversation ${duplicate.id} into ${canonical.id}: ${error.message}`)
          }
        }
      }
    }

    console.log(`   ✅ Merged ${stats.conversationsMerged} duplicate conversations\n`)

    // Print summary
    console.log(`\n${'='.repeat(60)}`)
    console.log('SUMMARY')
    console.log(`${'='.repeat(60)}`)
    console.log(`Contacts backfilled: ${stats.contactsBackfilled}`)
    console.log(`Contacts merged: ${stats.contactsMerged}`)
    console.log(`Conversations merged: ${stats.conversationsMerged}`)
    console.log(`Messages moved: ${stats.messagesMoved}`)
    console.log(`Leads updated: ${stats.leadsUpdated}`)
    console.log(`Tasks updated: ${stats.tasksUpdated}`)
    if (stats.errors.length > 0) {
      console.log(`\n⚠️  Errors (${stats.errors.length}):`)
      stats.errors.slice(0, 10).forEach((error) => console.log(`   - ${error}`))
      if (stats.errors.length > 10) {
        console.log(`   ... and ${stats.errors.length - 10} more`)
      }
    }
    console.log(`\n${'='.repeat(60)}\n`)

    if (DRY_RUN) {
      console.log('⚠️  This was a DRY RUN. No changes were made.')
      console.log('   To execute, run: DRY_RUN=false npx tsx scripts/merge-contacts.ts\n')
    } else {
      console.log('✅ Merge completed successfully!\n')
    }
  } catch (error: any) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsApp, sendEmail } from '@/lib/messaging'
import { generateExpiryReminderMessage, generateFollowUpMessage } from '@/lib/aiMessageGeneration'
import { getExpiriesInWindow, getOverdueExpiries } from '@/lib/expiry-helpers'
import { requireAdminOrManagerApi } from '@/lib/authApi'
import { runRuleOnLead } from '@/lib/automation/engine'
/**
 * POST /api/automation/run-daily
 * Secure automation runner - requires CRON_SECRET header
 * Idempotent via AutomationRunLog
 */
export async function POST(req: NextRequest) {
  try {
       // Security: Require CRON_SECRET header OR authenticated ADMIN/MANAGER user
       const cronSecret = req.headers.get('x-cron-secret')
       const expectedSecret = process.env.CRON_SECRET
   
       // Check if user is authenticated as ADMIN or MANAGER
       let isAuthorized = false
       try {
         const user = await requireAdminOrManagerApi()
         if (user) {
           isAuthorized = true
         }
       } catch (authError) {
         // User is not authenticated as ADMIN/MANAGER, check CRON_SECRET instead
       }
   
       // If not authorized via user auth, check CRON_SECRET
       if (!isAuthorized) {
         if (!expectedSecret) {
           return NextResponse.json(
             { error: 'CRON_SECRET not configured in environment' },
             { status: 500 }
           )
         }
   
         if (!cronSecret || cronSecret !== expectedSecret) {
           return NextResponse.json(
             { error: 'Unauthorized: Invalid or missing x-cron-secret header' },
             { status: 401 }
           )
         }
       }

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const now = new Date()
    const dateKey = today.toISOString().split('T')[0] // YYYY-MM-DD

    const results = {
      rulesRun: 0,
      expiryRemindersSent: 0,
      followUpsSent: 0,
      draftsCreated: 0, // Autopilot v1: draft messages created
      skippedDuplicates: 0,
      errors: [] as string[],
    }
    
    // Autopilot v1: Draft-only mode
    // Check if we should create drafts instead of sending
    const draftMode = req.headers.get('x-autopilot-mode') === 'draft' || 
                      process.env.AUTOPILOT_MODE === 'draft'

    // Get active automation rules
    const activeRules = await prisma.automationRule.findMany({
      where: { isActive: true },
    })

    results.rulesRun = activeRules.length

    // ========================================
    // AUTOPILOT V1: Draft Mode - Follow-ups and Expiries
    // ========================================
    if (draftMode) {
      // Get admin user for assignment (fallback)
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      })
      
      // 1. Find follow-ups due today + overdue
      const leadsNeedingFollowUp = await prisma.lead.findMany({
        where: {
          AND: [
            {
              OR: [
                { nextFollowUpAt: { lte: today } },
                { 
                  AND: [
                    { nextFollowUpAt: null },
                    { lastContactAt: { not: null } }
                  ]
                }
              ]
            },
            {
              // Stage filtering: exclude inactive stages (check both new enum and legacy field)
              OR: [
                { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
                { pipelineStage: { notIn: ['completed', 'won', 'lost'] } }
              ]
            }
          ]
        },
        include: {
          contact: true,
          assignedUser: true,
          conversations: {
            orderBy: { lastMessageAt: 'desc' },
            take: 1
          }
        }
      })
      
      // 2. Find expiries within 90 days
      const expiriesInWindow = await getExpiriesInWindow(90)
      const overdueExpiries = await getOverdueExpiries()
      const allExpiries = [...expiriesInWindow, ...overdueExpiries]
      
      // 3. Generate AI drafts for follow-ups
      for (const lead of leadsNeedingFollowUp) {
        try {
          // Get or create conversation
          let conversation = lead.conversations[0]
          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                contactId: lead.contactId,
                leadId: lead.id,
                channel: 'whatsapp', // Default channel
                status: 'open'
              }
            })
          }
          
          // Generate AI draft - call directly since we're on the server
          // Import the function directly to avoid HTTP overhead and auth issues
          try {
            const { generateDraftReply } = await import('@/lib/ai/generate')
            const { buildConversationContextFromLead } = await import('@/lib/ai/context')
            
            // Build context for AI generation from lead
            const contextSummary = await buildConversationContextFromLead(lead.id, 'whatsapp')
            
            if (!contextSummary || !contextSummary.structured) {
              results.errors.push(`Lead ${lead.id}: Failed to build conversation context`)
              continue
            }
            
            // Set objective for followup
            const context = {
              ...contextSummary.structured,
              objective: 'followup'
            }
            
            const draftResult = await generateDraftReply(context, 'professional', 'en')
            
            if (!draftResult.text) {
              results.errors.push(`Lead ${lead.id}: Draft generated but empty`)
              continue
            }
          
            // Assign to lead's agent or admin
            const assignedUserId = lead.assignedUserId || adminUser?.id || null
            
            // Create Message with status draft
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                leadId: lead.id,
                contactId: lead.contactId,
                direction: 'OUTBOUND',
                channel: 'whatsapp',
                body: draftResult.text,
                status: 'DRAFT',
                createdByUserId: assignedUserId,
                meta: JSON.stringify({
                  objective: 'followup',
                  tone: 'professional',
                  language: 'en',
                })
              }
            })
            
            // Log automation run
            const dateKey = today.toISOString().split('T')[0]
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleKey: 'autopilot_followup',
                leadId: lead.id,
                contactId: lead.contactId,
                userId: assignedUserId,
                status: 'SUCCESS',
                message: 'Draft created for follow-up',
                details: JSON.stringify({
                  objective: 'followup'
                }),
                ranAt: new Date()
              }
            })
          } catch (draftError: any) {
            results.errors.push(`Lead ${lead.id}: ${draftError.message || 'Failed to generate draft'}`)
            console.error(`Failed to generate draft for lead ${lead.id}:`, draftError)
            continue
          }
          
          results.draftsCreated++
        } catch (error: any) {
          results.errors.push(`Lead ${lead.id} followup: ${error.message}`)
        }
      }
      
      // 4. Generate AI drafts for expiries
      for (const expiry of allExpiries) {
        try {
          // Skip if lead is in inactive stage
          if (expiry.leadId) {
            const lead = await prisma.lead.findUnique({
              where: { id: expiry.leadId },
              select: { stage: true, pipelineStage: true }
            })
            
            if (lead && (lead.stage === 'COMPLETED_WON' || lead.stage === 'LOST' || 
                         lead.pipelineStage === 'completed' || lead.pipelineStage === 'lost')) {
              continue // Skip expired leads, but continue tracking expiry
            }
          }
          
          // Get or create conversation
          let conversation = await prisma.conversation.findFirst({
            where: {
              contactId: expiry.contactId,
              channel: 'whatsapp'
            }
          })
          
          if (!conversation) {
            conversation = await prisma.conversation.create({
              data: {
                contactId: expiry.contactId,
                leadId: expiry.leadId,
                channel: 'whatsapp',
                status: 'open'
              }
            })
          }
          
          // Generate AI draft for renewal - call directly since we're on the server
          try {
            const { generateDraftReply } = await import('@/lib/ai/generate')
            const { buildConversationContextFromLead } = await import('@/lib/ai/context')
            
            if (!expiry.leadId) {
              // If no lead, build from contact
              const contact = await prisma.contact.findUnique({
                where: { id: expiry.contactId },
                include: {
                  expiryItems: {
                    where: { id: expiry.id },
                    orderBy: { expiryDate: 'asc' }
                  }
                }
              })
              
              if (!contact) {
                results.errors.push(`Expiry ${expiry.id}: Contact not found`)
                continue
              }
              
              // Use a simplified context for contact-only renewals
              const context = {
                contact: {
                  name: contact.fullName,
                  phone: contact.phone,
                  email: contact.email,
                  nationality: contact.nationality
                },
                lead: null,
                messages: [],
                objective: 'renewal',
                expiryType: expiry.type,
                expiryDate: expiry.expiryDate
              } as any
              
              const draftResult = await generateDraftReply(context, 'professional', 'en')
              
              // ... rest of the code for contact-only renewals
              continue // Skip to next expiry for now
            }
            
            // Build context from lead
            const contextSummary = await buildConversationContextFromLead(expiry.leadId, 'whatsapp')
            
            if (!contextSummary || !contextSummary.structured) {
              results.errors.push(`Expiry ${expiry.id}: Failed to build conversation context`)
              continue
            }
            
            // Modify context to include renewal objective
            const context = {
              ...contextSummary.structured,
              objective: 'renewal',
              expiryType: expiry.type,
              expiryDate: expiry.expiryDate
            }
            
            const draftResult = await generateDraftReply(context, 'professional', 'en')
            
            if (!draftResult.text) {
              results.errors.push(`Expiry ${expiry.id}: Draft generated but empty`)
              continue
            }
            
            // Assign to expiry's assigned user or admin
            const assignedUserId = expiry.assignedUserId || adminUser?.id || null
            
            // Create Message with status draft
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                leadId: expiry.leadId,
                contactId: expiry.contactId,
                direction: 'OUTBOUND',
                channel: 'whatsapp',
                body: draftResult.text,
                status: 'DRAFT',
                createdByUserId: assignedUserId,
                meta: JSON.stringify({
                  objective: 'renewal',
                  expiryType: expiry.type,
                  expiryDate: expiry.expiryDate,
                  tone: 'professional',
                  language: 'en',
                })
              }
            })
            
            // Log automation run
            const dateKey = today.toISOString().split('T')[0]
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleKey: 'autopilot_expiry',
                leadId: expiry.leadId,
                contactId: expiry.contactId,
                userId: assignedUserId,
                status: 'SUCCESS',
                message: `Draft created for ${expiry.type} renewal`,
                details: JSON.stringify({
                  expiryId: expiry.id,
                  expiryType: expiry.type,
                  expiryDate: expiry.expiryDate,
                }),
                ranAt: new Date()
              }
            })
          } catch (draftError: any) {
            results.errors.push(`Expiry ${expiry.id}: ${draftError.message || 'Failed to generate draft'}`)
            console.error(`Failed to generate draft for expiry ${expiry.id}:`, draftError)
            continue
          }
          
          results.draftsCreated++
        } catch (error: any) {
          results.errors.push(`Expiry ${expiry.id}: ${error.message}`)
        }
      }
      
      return NextResponse.json({
        success: true,
        timestamp: now.toISOString(),
        mode: 'draft',
        ...results,
      })
    }
    
    // ========================================
    // PART A: Expiry Reminders (Original sending mode)
    // ========================================
    const expiryRules = activeRules.filter((r) => r.type === 'expiry_reminder')

    if (expiryRules.length > 0) {
      const leadsWithExpiry = await prisma.lead.findMany({
        where: {
          expiryDate: {
            gte: today, // Not expired yet
          },
          pipelineStage: {
            notIn: ['completed', 'lost'],
          },
        },
        include: {
          contact: true,
        },
      })

      for (const lead of leadsWithExpiry) {
        if (!lead.expiryDate) continue

        const expiryDate = new Date(lead.expiryDate)
        expiryDate.setUTCHours(0, 0, 0, 0)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

        for (const rule of expiryRules) {
          if (!rule.daysBeforeExpiry) continue

          // Check if should send (within 1 day window)
          const dayRange = [rule.daysBeforeExpiry - 1, rule.daysBeforeExpiry, rule.daysBeforeExpiry + 1]
          const shouldSend = dayRange.includes(daysUntilExpiry)

          if (!shouldSend) continue

          // Idempotency: Check if already logged today
          const actionKey = `expiry:${rule.daysBeforeExpiry}`
          try {
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleId: rule.id,
                leadId: lead.id,
                actionKey,
              },
            })
          } catch (error: any) {
            // Unique constraint violation = already processed
            if (error.code === 'P2002') {
              results.skippedDuplicates++
              continue
            }
            throw error
          }

          try {
            const hasPhone = lead.contact.phone && lead.contact.phone.trim() !== ''
            const hasEmail = lead.contact.email && lead.contact.email.trim() !== ''

            const message = await generateExpiryReminderMessage(lead as any, rule.daysBeforeExpiry)

            let sendResult
            if (rule.channel === 'whatsapp' && hasPhone) {
              sendResult = await sendWhatsApp(lead as any, lead.contact as any, message)
            } else if (rule.channel === 'email' && hasEmail) {
              sendResult = await sendEmail(
                lead as any,
                lead.contact as any,
                `Expiry Reminder: ${rule.daysBeforeExpiry} Days`,
                message
              )
            } else {
              results.errors.push(
                `Lead ${lead.id}: ${rule.name} skipped (no ${rule.channel === 'whatsapp' ? 'phone' : 'email'})`
              )
              continue
            }

            if (sendResult.success) {
              await prisma.lead.update({
                where: { id: lead.id },
                data: { lastContactAt: now },
              })
              results.expiryRemindersSent++
            } else {
              results.errors.push(`Lead ${lead.id}: ${rule.name} failed to send`)
            }
          } catch (error: any) {
            results.errors.push(`Lead ${lead.id} ${rule.name}: ${error.message}`)
          }
        }
      }
    }

    // ========================================
    // PART B: Info/Quotation Follow-ups (Phase 3)
    // ========================================
    const infoSharedRules = activeRules.filter((r) => r.trigger === 'INFO_SHARED')

    if (infoSharedRules.length > 0) {
      // Find leads where info was shared (using raw query for now until Prisma client regenerated)
      const leadsWithInfoShared = await prisma.$queryRaw<Array<{
        id: number
        infoSharedAt: Date | null
        lastInfoSharedType: string | null
        contactId: number
        pipelineStage: string
      }>>`
        SELECT id, "infoSharedAt", "lastInfoSharedType", "contactId", "pipelineStage"
        FROM "Lead"
        WHERE "infoSharedAt" IS NOT NULL
        AND "pipelineStage" NOT IN ('completed', 'lost')
      `

      for (const leadRow of leadsWithInfoShared) {
        if (!leadRow.infoSharedAt) continue

        // Load full lead with relations
        const lead = await prisma.lead.findUnique({
          where: { id: leadRow.id },
          include: {
            contact: true,
            expiryItems: {
              orderBy: { expiryDate: 'asc' },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        })

        if (!lead) continue

        for (const rule of infoSharedRules) {
          try {
            const conditions = rule.conditions 
              ? (typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions)
              : {}
            const daysAfter = conditions.daysAfter || 2

            const sharedDate = new Date(leadRow.infoSharedAt!)
            const daysSinceShared = Math.floor(
              (today.getTime() - sharedDate.getTime()) / (1000 * 60 * 60 * 24)
            )

            // Check if we're in the follow-up window (daysAfter ± 1 day)
            if (daysSinceShared < (daysAfter - 1) || daysSinceShared > (daysAfter + 1)) {
              continue
            }

            // Idempotency: Check if already processed
            const actionKey = `info_followup_${lead.id}_${sharedDate.toISOString().split('T')[0]}`
            try {
              await prisma.automationRunLog.create({
                data: {
                  dateKey,
                  ruleId: rule.id,
                  leadId: lead.id,
                  actionKey,
                },
              })
            } catch (error: any) {
              if (error.code === 'P2002') {
                results.skippedDuplicates++
                continue
              }
              throw error
            }

            // Build context and run rule
            // Cast lead to include new fields (will be available after migration)
            const leadWithNewFields = lead as any & {
              infoSharedAt: Date | null
              lastInfoSharedType: string | null
            }
            leadWithNewFields.infoSharedAt = leadRow.infoSharedAt
            leadWithNewFields.lastInfoSharedType = leadRow.lastInfoSharedType

            const context = {
              lead: leadWithNewFields,
              contact: lead.contact,
              expiries: lead.expiryItems,
              recentMessages: lead.messages,
              triggerData: {
                infoType: leadRow.lastInfoSharedType || 'details',
                sharedAt: leadRow.infoSharedAt,
              },
            }

            const ruleResult = await runRuleOnLead(rule, context)
            
            if (ruleResult.status === 'SUCCESS') {
              results.followUpsSent++
            } else if (ruleResult.status === 'SKIPPED') {
              results.skippedDuplicates++
            } else {
              results.errors.push(`Lead ${lead.id}: ${ruleResult.reason || 'Unknown error'}`)
            }
          } catch (error: any) {
            results.errors.push(`Lead ${lead.id} (INFO_SHARED): ${error.message}`)
          }
        }
      }
    }

    // ========================================
    // PART C: Follow-up Reminders
    // ========================================
    const followupRules = activeRules.filter((r) => r.type === 'followup_due')

    if (followupRules.length > 0) {
      // Leads where nextFollowUpAt <= today OR (lastContactAt exists and now >= lastContactAt + followupAfterDays)
      const allLeads = await prisma.lead.findMany({
        where: {
          pipelineStage: {
            notIn: ['completed', 'lost'],
          },
        },
        include: {
          contact: true,
        },
      })

      for (const lead of allLeads) {
        for (const rule of followupRules) {
          if (!rule.followupAfterDays) continue

          let shouldFollowUp = false

          // Check nextFollowUpAt
          if (lead.nextFollowUpAt) {
            const followUpDate = new Date(lead.nextFollowUpAt)
            followUpDate.setUTCHours(0, 0, 0, 0)
            if (followUpDate.getTime() <= today.getTime()) {
              shouldFollowUp = true
            }
          }

          // Check lastContactAt + followupAfterDays
          if (!shouldFollowUp && lead.lastContactAt) {
            const lastContactDate = new Date(lead.lastContactAt)
            lastContactDate.setUTCDate(lastContactDate.getUTCDate() + rule.followupAfterDays)
            lastContactDate.setUTCHours(0, 0, 0, 0)
            if (lastContactDate.getTime() <= today.getTime()) {
              shouldFollowUp = true
            }
          }

          if (!shouldFollowUp) continue

          // Idempotency: Check if already logged today
          const actionKey = `followup`
          try {
            await prisma.automationRunLog.create({
              data: {
                dateKey,
                ruleId: rule.id,
                leadId: lead.id,
                actionKey,
              },
            })
          } catch (error: any) {
            // Unique constraint violation = already processed
            if (error.code === 'P2002') {
              results.skippedDuplicates++
              continue
            }
            throw error
          }

          try {
            const recentMessages = await prisma.communicationLog.findMany({
              where: { leadId: lead.id },
              orderBy: { createdAt: 'desc' },
              take: 3,
            })

            const message = await generateFollowUpMessage(
              lead as any,
              recentMessages.map((m) => ({ channel: m.channel, messageSnippet: m.messageSnippet }))
            )

            const hasPhone = lead.contact.phone && lead.contact.phone.trim() !== ''
            const hasEmail = lead.contact.email && lead.contact.email.trim() !== ''

            let sendResult
            if (rule.channel === 'whatsapp' && hasPhone) {
              sendResult = await sendWhatsApp(lead as any, lead.contact as any, message)
            } else if (rule.channel === 'email' && hasEmail) {
              sendResult = await sendEmail(
                lead as any,
                lead.contact as any,
                'Follow-up from Alain Business Center',
                message
              )
            } else {
              results.errors.push(
                `Lead ${lead.id}: ${rule.name} skipped (no ${rule.channel === 'whatsapp' ? 'phone' : 'email'})`
              )
              continue
            }

            if (sendResult.success) {
              // Update nextFollowUpAt
              const nextFollowUpDate = new Date(now)
              nextFollowUpDate.setUTCDate(nextFollowUpDate.getUTCDate() + rule.followupAfterDays)

              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  nextFollowUpAt: nextFollowUpDate,
                  lastContactAt: now,
                },
              })

              // Create task if Task model exists
              try {
                await prisma.task.create({
                  data: {
                    leadId: lead.id,
                    title: `Follow-up via ${rule.channel}`,
                    type: rule.channel === 'whatsapp' ? 'whatsapp' : 'email',
                    dueAt: nextFollowUpDate,
                  },
                })
              } catch (taskError) {
                // Task creation is optional - don't fail if it errors
                console.warn('Failed to create task:', taskError)
              }

              results.followUpsSent++
            } else {
              results.errors.push(`Lead ${lead.id}: ${rule.name} failed to send`)
            }
          } catch (error: any) {
            results.errors.push(`Lead ${lead.id} ${rule.name}: ${error.message}`)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      mode: draftMode ? 'draft' : 'send',
      ...results,
    })
  } catch (error: any) {
    console.error('POST /api/automation/run-daily error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error?.message ?? 'Unknown error in daily automation',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)

    const activeRules = await prisma.automationRule.findMany({
      where: { isActive: true },
    })

    const expiryRules = activeRules.filter((r) => r.type === 'expiry_reminder')
    const leadsWithExpiry = await prisma.lead.findMany({
      where: {
        expiryDate: {
          gte: today,
        },
      },
      select: {
        id: true,
        expiryDate: true,
      },
    })

    let leadsExpiringMatched = 0
    for (const lead of leadsWithExpiry) {
      if (!lead.expiryDate) continue
      const expiryDate = new Date(lead.expiryDate)
      expiryDate.setUTCHours(0, 0, 0, 0)
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

      for (const rule of expiryRules) {
        if (!rule.daysBeforeExpiry) continue
        const dayRange = [rule.daysBeforeExpiry - 1, rule.daysBeforeExpiry, rule.daysBeforeExpiry + 1]
        if (dayRange.includes(daysUntilExpiry)) {
          leadsExpiringMatched++
          break
        }
      }
    }

    const leadsNeedingFollowUp = await prisma.lead.count({
      where: {
        nextFollowUpAt: {
          lte: today,
        },
        pipelineStage: {
          notIn: ['completed', 'lost'],
        },
      },
    })

    return NextResponse.json({
      leadsExpiringMatched,
      leadsNeedingFollowUp,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Unknown error' }, { status: 500 })
  }
}

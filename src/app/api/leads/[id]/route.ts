import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuthApi } from '@/lib/authApi'
import { recalcLeadRenewalScore } from '@/lib/renewalScoring'
import { AutomationContext, runRuleOnLead } from '@/lib/automation/engine'

// Active stages that require follow-up discipline
const ACTIVE_STAGES = ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED', 'PROPOSAL_SENT', 'IN_PROGRESS', 'ON_HOLD']
const INACTIVE_STAGES = ['COMPLETED_WON', 'LOST']

// GET /api/leads/[id]
// Returns comprehensive lead detail with all related data for Odoo-style record view
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestStart = Date.now()
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  try {
    console.log(`[LEAD-API] [${requestId}] Request start for lead detail`)
    
    const authStart = Date.now()
    await requireAuthApi()
    const authDuration = Date.now() - authStart
    console.log(`[LEAD-API] [${requestId}] Auth completed in ${authDuration}ms`)
    
    const resolvedParams = await params
    const numericId = parseInt(resolvedParams.id)
    
    // Check for fallback parameters (conversationId or contactId)
    const searchParams = req.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')
    const contactId = searchParams.get('contactId')
    const action = searchParams.get('action') // Preserve action query param
    
    if (isNaN(numericId)) {
      console.log(`[LEAD-API] [${requestId}] Invalid ID: ${resolvedParams.id}`)
      return NextResponse.json(
        { error: 'Invalid ID' },
        { status: 400 }
      )
    }

    console.log(`[LEAD-API] [${requestId}] Fetching lead ${numericId} (with fallback resolution)`)

    // PHASE 2: Enhanced fallback resolution
    // First, try to fetch as leadId
    const dbQueryStart = Date.now()
    console.log(`[LEAD-API] [${requestId}] DB query start`)
    
    let lead = await prisma.lead.findUnique({
      where: { id: numericId },
      include: {
        contact: true,
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        serviceType: true,
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedByUser: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        tasks: {
          orderBy: [
            { status: 'asc' }, // OPEN first, then DONE
            { dueAt: 'asc' }
          ],
          include: {
            assignedUser: {
              select: { id: true, name: true, email: true }
            },
            createdByUser: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        conversations: {
          where: { 
            deletedAt: null, // PHASE 1: Exclude soft-deleted conversations
          },
          orderBy: { createdAt: 'desc' },
          take: 10, // Limit to 10 most recent conversations
          select: {
            id: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            createdAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Last message preview only
              select: {
                id: true,
                direction: true,
                body: true,
                createdAt: true,
              }
            }
          }
        },
        communicationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Recent activity
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 20, // Recent messages for timeline
        },
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Recent alerts/notifications
        }
      },
    })

    // PHASE 2: Enhanced fallback resolution if lead not found
    if (!lead) {
      console.log(`[LEAD-API] [${requestId}] Lead ${numericId} not found, attempting fallback resolution...`)
      
      // Strategy A: If numericId might be a conversationId, try that first
      const conversationById = await prisma.conversation.findUnique({
        where: { id: numericId },
        select: { leadId: true, contactId: true },
      })
      
      if (conversationById?.leadId) {
        console.log(`[API] Found lead ${conversationById.leadId} via conversation ${numericId}`)
        const redirectUrl = `/leads/${conversationById.leadId}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
        return NextResponse.json({
          _redirect: redirectUrl,
          _fallbackReason: `ID ${numericId} was a conversationId, redirecting to lead ${conversationById.leadId}`,
          _conversationId: numericId.toString(),
        }, { status: 404 })
      }
      
      // Strategy B: If numericId might be a contactId, find most recent open lead
      const contactById = await prisma.contact.findUnique({
        where: { id: numericId },
        select: { id: true },
      })
      
      if (contactById) {
        const latestLead = await prisma.lead.findFirst({
          where: { 
            contactId: numericId,
            stage: { notIn: ['COMPLETED_WON', 'LOST'] }, // Prefer active leads
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
        
        if (latestLead) {
          console.log(`[API] Found lead ${latestLead.id} via contact ${numericId}`)
          const redirectUrl = `/leads/${latestLead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
          return NextResponse.json({
            _redirect: redirectUrl,
            _fallbackReason: `ID ${numericId} was a contactId, redirecting to lead ${latestLead.id}`,
            _contactId: numericId.toString(),
          }, { status: 404 })
        }
      }
      
      // Strategy C: Try to find lead by conversationId if provided in query params
      if (conversationId) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: parseInt(conversationId) },
          select: { leadId: true, contactId: true },
        })
        
        if (conversation?.leadId) {
          console.log(`[API] Found lead ${conversation.leadId} via conversation ${conversationId}`)
          lead = await prisma.lead.findUnique({
            where: { id: conversation.leadId },
            include: {
              contact: true,
              assignedUser: {
                select: { id: true, name: true, email: true }
              },
              serviceType: true,
              expiryItems: {
                orderBy: { expiryDate: 'asc' },
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              documents: {
                orderBy: { createdAt: 'desc' },
                include: {
                  uploadedByUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              tasks: {
                orderBy: [
                  { status: 'asc' },
                  { dueAt: 'asc' }
                ],
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  },
                  createdByUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              conversations: {
                orderBy: { createdAt: 'desc' },
                include: {
                  messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  }
                }
              },
              communicationLogs: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 20,
              },
              notifications: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              }
            },
          })
          
          if (lead) {
            // Return redirect hint with preserved query params
            const redirectUrl = `/leads/${lead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
            return NextResponse.json({
              ...lead,
              _redirect: redirectUrl,
              _fallbackReason: 'Found via conversationId query param',
              tasksGrouped: {
                open: (lead as any).tasks?.filter((t: any) => t.status === 'OPEN') || [],
                done: (lead as any).tasks?.filter((t: any) => t.status === 'DONE') || [],
                snoozed: (lead as any).tasks?.filter((t: any) => t.status === 'SNOOZED') || [],
              }
            })
          }
        }
        
        // Strategy D: Try to find latest lead by contactId from conversation
        if (conversation?.contactId) {
          const latestLead = await prisma.lead.findFirst({
            where: { 
              contactId: conversation.contactId,
              stage: { notIn: ['COMPLETED_WON', 'LOST'] }, // Prefer active leads
            },
            orderBy: { createdAt: 'desc' },
            include: {
              contact: true,
              assignedUser: {
                select: { id: true, name: true, email: true }
              },
              serviceType: true,
              expiryItems: {
                orderBy: { expiryDate: 'asc' },
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              documents: {
                orderBy: { createdAt: 'desc' },
                include: {
                  uploadedByUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              tasks: {
                orderBy: [
                  { status: 'asc' },
                  { dueAt: 'asc' }
                ],
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  },
                  createdByUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              conversations: {
                orderBy: { createdAt: 'desc' },
                include: {
                  messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  }
                }
              },
              communicationLogs: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 20,
              },
              notifications: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              }
            },
          })
          
          if (latestLead) {
            console.log(`[API] Found latest lead ${latestLead.id} via contactId ${conversation.contactId}`)
            const redirectUrl = `/leads/${latestLead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
            return NextResponse.json({
              ...latestLead,
              _redirect: redirectUrl,
              _fallbackReason: 'Found latest lead via contactId',
              tasksGrouped: {
                open: (latestLead as any).tasks?.filter((t: any) => t.status === 'OPEN') || [],
                done: (latestLead as any).tasks?.filter((t: any) => t.status === 'DONE') || [],
                snoozed: (latestLead as any).tasks?.filter((t: any) => t.status === 'SNOOZED') || [],
              }
            })
          }
        }
      }
      
      // Try to find latest lead by contactId if provided directly
      if (contactId) {
        const latestLead = await prisma.lead.findFirst({
          where: { contactId: parseInt(contactId) },
          orderBy: { createdAt: 'desc' },
          include: {
            contact: true,
            assignedUser: {
              select: { id: true, name: true, email: true }
            },
            serviceType: true,
            expiryItems: {
              orderBy: { expiryDate: 'asc' },
              include: {
                assignedUser: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            documents: {
              orderBy: { createdAt: 'desc' },
              include: {
                uploadedByUser: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            tasks: {
              orderBy: [
                { status: 'asc' },
                { dueAt: 'asc' }
              ],
              include: {
                assignedUser: {
                  select: { id: true, name: true, email: true }
                },
                createdByUser: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            conversations: {
              orderBy: { createdAt: 'desc' },
              include: {
                messages: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                }
              }
            },
            communicationLogs: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
            notifications: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            }
          },
        })
        
        if (latestLead) {
          console.log(`[API] Found latest lead ${latestLead.id} via contactId ${contactId}`)
          const redirectUrl = `/leads/${latestLead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
          return NextResponse.json({
            ...latestLead,
            _redirect: redirectUrl,
            _fallbackReason: 'Found latest lead via contactId',
            tasksGrouped: {
              open: (latestLead as any).tasks?.filter((t: any) => t.status === 'OPEN') || [],
              done: (latestLead as any).tasks?.filter((t: any) => t.status === 'DONE') || [],
              snoozed: (latestLead as any).tasks?.filter((t: any) => t.status === 'SNOOZED') || [],
            }
          })
        }
      }
      
      // No fallback found
      const totalDuration = Date.now() - requestStart
      console.log(`[LEAD-API] [${requestId}] Lead ${numericId} not found in database, no fallback available (${totalDuration}ms)`)
      return NextResponse.json(
        { 
          error: 'Lead not found', 
          leadId: numericId,
          _fallbackAttempted: true,
          _conversationId: conversationId || null,
          _contactId: contactId || null,
        },
        { status: 404 }
      )
    }

    console.log(`[LEAD-API] [${requestId}] Successfully fetched lead ${lead.id} (contact: ${lead.contact?.fullName || 'N/A'})`)

    // Group tasks by status (handle case where tasks might not be included in fallback query)
    const tasks = (lead as any).tasks || []
    const tasksOpen = tasks.filter((t: any) => t.status === 'OPEN')
    const tasksDone = tasks.filter((t: any) => t.status === 'DONE')
    const tasksSnoozed = tasks.filter((t: any) => t.status === 'SNOOZED')

    const responseStart = Date.now()
    const response = NextResponse.json({
      ...lead,
      tasksGrouped: {
        open: tasksOpen,
        done: tasksDone,
        snoozed: tasksSnoozed,
      }
    })
    const responseDuration = Date.now() - responseStart
    const totalDuration = Date.now() - requestStart
    
    console.log(`[LEAD-API] [${requestId}] Response prepared in ${responseDuration}ms, total: ${totalDuration}ms`)
    return response
  } catch (error: any) {
    const totalDuration = Date.now() - requestStart
    console.error(`[LEAD-API] [${requestId}] GET /api/leads/[id] error after ${totalDuration}ms:`, error.message)
    console.error(`[LEAD-API] [${requestId}] Error stack:`, error.stack)
    
    // If it's an auth error, return 401
    if (error.statusCode === 401) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: error?.message ?? 'Failed to fetch lead detail' },
      { status: error.statusCode || 500 }
    )
  }
}

// PATCH /api/leads/[id]
// Update lead fields: status, expiryDate, nextFollowUpAt, etc.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Get current lead to check stage changes
    const currentLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { stage: true, pipelineStage: true, nextFollowUpAt: true }
    })

    if (!currentLead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Build update data object (only include fields that are provided)
    const updateData: any = {}
    
    // New enum fields
    if (body.stage !== undefined) {
      updateData.stage = body.stage
    }
    
    if (body.serviceTypeEnum !== undefined) {
      updateData.serviceTypeEnum = body.serviceTypeEnum || null
    }
    
    if (body.priority !== undefined) {
      updateData.priority = body.priority || null
    }
    
    if (body.lastContactChannel !== undefined) {
      updateData.lastContactChannel = body.lastContactChannel || null
    }
    
    if (body.assignedUserId !== undefined) {
      updateData.assignedUserId = body.assignedUserId || null
    }
    
    if (body.aiAgentProfileId !== undefined) {
      updateData.aiAgentProfileId = body.aiAgentProfileId || null
    }
    
    if (body.valueEstimate !== undefined) {
      updateData.valueEstimate = body.valueEstimate || null
    }
    
    // Legacy fields
    if (body.status !== undefined) {
      updateData.status = body.status
    }
    
    if (body.expiryDate !== undefined) {
      // Handle empty strings - convert to null instead of Invalid Date
      if (body.expiryDate === '' || body.expiryDate === null) {
        updateData.expiryDate = null
      } else {
        const parsedDate = new Date(body.expiryDate)
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for expiryDate' },
            { status: 400 }
          )
        }
        updateData.expiryDate = parsedDate
      }
    }
    
    if (body.nextFollowUpAt !== undefined) {
      // Handle empty strings - convert to null instead of Invalid Date
      if (body.nextFollowUpAt === '' || body.nextFollowUpAt === null) {
        updateData.nextFollowUpAt = null
      } else {
        const parsedDate = new Date(body.nextFollowUpAt)
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for nextFollowUpAt' },
            { status: 400 }
          )
        }
        updateData.nextFollowUpAt = parsedDate
      }
    }
    
    if (body.leadType !== undefined) {
      updateData.leadType = body.leadType
    }
    
    if (body.notes !== undefined) {
      updateData.notes = body.notes
    }
    
    if (body.autopilotEnabled !== undefined) {
      updateData.autopilotEnabled = body.autopilotEnabled
    }
    
    // Auto-reply settings
    if (body.autoReplyEnabled !== undefined) {
      updateData.autoReplyEnabled = body.autoReplyEnabled
    }
    
    if (body.allowOutsideHours !== undefined) {
      updateData.allowOutsideHours = body.allowOutsideHours
    }
    
    if (body.autoReplyMode !== undefined) {
      updateData.autoReplyMode = body.autoReplyMode || null
    }
    
    if (body.estimatedRenewalValue !== undefined) {
      updateData.estimatedRenewalValue = body.estimatedRenewalValue || null
    }
    
    if (body.renewalProbability !== undefined) {
      updateData.renewalProbability = body.renewalProbability !== null ? parseInt(String(body.renewalProbability)) : null
    }
    
    if (body.renewalNotes !== undefined) {
      updateData.renewalNotes = body.renewalNotes || null
    }
    
    if (body.autoWorkflowStatus !== undefined) {
      updateData.autoWorkflowStatus = body.autoWorkflowStatus
    }
    
    if (body.pipelineStage !== undefined) {
      updateData.pipelineStage = body.pipelineStage
    }
    
    if (body.lastContactAt !== undefined) {
      if (body.lastContactAt === '' || body.lastContactAt === null) {
        updateData.lastContactAt = null
      } else {
        const parsedDate = new Date(body.lastContactAt)
        if (isNaN(parsedDate.getTime())) {
          return NextResponse.json(
            { error: 'Invalid date format for lastContactAt' },
            { status: 400 }
          )
        }
        updateData.lastContactAt = parsedDate
      }
    }


    // Follow-up discipline validation
    // Check if stage is changing to an active stage
    const newStage = updateData.stage || currentLead.stage || currentLead.pipelineStage?.toUpperCase()
    const isChangingToActiveStage = newStage && ACTIVE_STAGES.includes(newStage.toUpperCase())
    
    if (isChangingToActiveStage) {
      const nextFollowUp = updateData.nextFollowUpAt !== undefined 
        ? updateData.nextFollowUpAt 
        : currentLead.nextFollowUpAt
      
      if (!nextFollowUp) {
        // Warning: needs follow-up but not blocking
        // In strict mode, you could return an error here
        // For now, we'll allow it but the frontend will show a warning
      } else {
        // Validate that follow-up is within 1-7 days
        const now = new Date()
        const followUpDate = new Date(nextFollowUp)
        const daysDiff = Math.ceil((followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        
        if (daysDiff < 0) {
          // Overdue - allow but frontend should highlight
        } else if (daysDiff > 7) {
          return NextResponse.json(
            { 
              error: 'Follow-up date must be within the next 7 days for active stages',
              warning: true
            },
            { status: 400 }
          )
        }
      }
    }

    // Update the lead
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      include: { 
        contact: true,
        assignedUser: {
          select: { id: true, name: true, email: true }
        },
        serviceType: true,
        expiryItems: {
          orderBy: { expiryDate: 'asc' }
        }
      },
    })

    // Recalculate renewal score if stage changed or renewal fields updated
    if (updateData.stage || updateData.estimatedRenewalValue !== undefined) {
      try {
        await recalcLeadRenewalScore(leadId)
      } catch (error) {
        console.warn('Failed to recalculate renewal score:', error)
        // Don't fail the request if score calculation fails
      }
    }

    // Recompute deal forecast if stage changed or relevant fields updated
    if (updateData.stage || updateData.serviceFeeAED !== undefined || updateData.stageProbabilityOverride !== undefined) {
      try {
        const { recomputeAndSaveForecast } = await import('@/lib/forecast/dealForecast')
        // Run in background - don't block request
        recomputeAndSaveForecast(leadId).catch((err) => {
          console.warn(`⚠️ [FORECAST] Failed to recompute forecast for lead ${leadId}:`, err.message)
        })
      } catch (error) {
        console.warn('Failed to recompute deal forecast:', error)
        // Don't fail the request if forecast calculation fails
      }
    }

    // Trigger STAGE_CHANGE automation if stage changed
    if (updateData.stage && currentLead.stage !== updateData.stage) {
      try {
        // Load lead with all relations for automation
        const leadForAutomation = await prisma.lead.findUnique({
          where: { id: leadId },
          include: {
            contact: true,
            expiryItems: {
              orderBy: { expiryDate: 'asc' },
            },
            documents: {
              orderBy: { createdAt: 'desc' },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        })

        if (leadForAutomation) {
          // Find STAGE_CHANGE rules
          const stageChangeRules = await prisma.automationRule.findMany({
            where: {
              isActive: true,
              enabled: true,
              trigger: 'STAGE_CHANGE',
            },
          })

          // Run each rule (non-blocking)
          for (const rule of stageChangeRules) {
            try {
              const context: AutomationContext = {
                lead: leadForAutomation,
                contact: leadForAutomation.contact,
                expiries: leadForAutomation.expiryItems || [],
                documents: leadForAutomation.documents || [],
                recentMessages: leadForAutomation.messages || [],
                triggerData: {
                  fromStage: currentLead.stage,
                  toStage: updateData.stage,
                },
              }

              await runRuleOnLead(rule, context)
            } catch (error) {
              console.error(`Error running STAGE_CHANGE rule ${rule.id}:`, error)
            }
          }
        }
      } catch (error) {
        console.warn('Failed to trigger STAGE_CHANGE automation:', error)
        // Don't fail the request if automation fails
      }
    }

    return NextResponse.json(lead)
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }
    
    console.error('PATCH /api/leads/[id] error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in PATCH /api/leads/[id]' },
      { status: 500 }
    )
  }
}




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
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
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
          orderBy: { lastMessageAt: 'desc' },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1, // Last message preview
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
        }
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Group tasks by status
    const tasksOpen = lead.tasks.filter(t => t.status === 'OPEN')
    const tasksDone = lead.tasks.filter(t => t.status === 'DONE')
    const tasksSnoozed = lead.tasks.filter(t => t.status === 'SNOOZED')

    return NextResponse.json({
      ...lead,
      tasksGrouped: {
        open: tasksOpen,
        done: tasksDone,
        snoozed: tasksSnoozed,
      }
    })
  } catch (error: any) {
    console.error('GET /api/leads/[id] error:', error)
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

    // Renewal fields
    if (body.estimatedRenewalValue !== undefined) {
      updateData.estimatedRenewalValue = body.estimatedRenewalValue ? body.estimatedRenewalValue.toString() : null
    }
    
    if (body.renewalNotes !== undefined) {
      updateData.renewalNotes = body.renewalNotes || null
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




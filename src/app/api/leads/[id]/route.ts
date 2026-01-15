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
  // Initialize errors array at function start for comprehensive error tracking
  // This ensures it's always accessible throughout the function
  const errors: string[] = [] as string[]
  
  const requestStart = Date.now()
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  // Parse params and numericId at function level so they're accessible in catch blocks
  let numericId: number = 0
  let resolvedParams: { id: string } = { id: '0' }
  try {
    resolvedParams = await params
    numericId = parseInt(resolvedParams.id)
  } catch (paramError) {
    // If params parsing fails, we'll handle it in the main try-catch
    console.error(`[LEAD-API] [${requestId}] Failed to parse params:`, paramError)
  }
  
  try {
    console.log(`[LEAD-API] [${requestId}] Request start for lead detail`)
    
    const authStart = Date.now()
    await requireAuthApi()
    const authDuration = Date.now() - authStart
    console.log(`[LEAD-API] [${requestId}] Auth completed in ${authDuration}ms`)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/leads/[id]/route.ts:29',message:'Params resolved and ID parsed',data:{requestId:requestId,resolvedId:resolvedParams.id,numericId:numericId,isNaN:isNaN(numericId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BB'})}).catch(()=>{});
    console.log(`[LEAD-API] [${requestId}] Parsed ID: ${numericId} from ${resolvedParams.id}`)
    // #endregion
    
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
    console.log(`[LEAD-API] [${requestId}] DB query start for lead ${numericId}`)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/leads/[id]/route.ts:55',message:'Starting Prisma query',data:{requestId:requestId,leadId:numericId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BC'})}).catch(()=>{});
    // #endregion
    let lead
    let queryType = 'full' // Track which query type was used
    try {
      // Full query: Load core data only (lead + contact + basic relations)
      // Additional data will be loaded separately to reduce memory usage
      lead = await prisma.lead.findUnique({
        where: { id: numericId },
        include: {
          contact: true,
          assignedUser: {
            select: { id: true, name: true, email: true }
          },
          serviceType: true,
          // Removed nested relations (expiryItems, documents, tasks, conversations, etc.)
          // These will be loaded separately in split queries to reduce memory usage
        },
      })
      const queryDuration = Date.now() - dbQueryStart
      console.log(`[LEAD-API] [${requestId}] Core query completed in ${queryDuration}ms`)
    } catch (error: any) {
      const queryDuration = Date.now() - dbQueryStart
      const errorCode = error?.code || error?.meta?.code
      const errorMessage = error?.message || 'Unknown error'
      
      console.error(`[LEAD-API] [${requestId}] Query failed after ${queryDuration}ms:`, {
        errorCode,
        errorMessage: errorMessage.substring(0, 200),
        leadId: numericId,
        queryType: 'full'
      })
      
      // Handle out of memory errors with fallback to ultra-minimal data
      if (errorCode === '53200' || errorMessage.includes('out of memory') || errorMessage.includes('memory')) {
        console.error(`[LEAD-API] [${requestId}] Out of memory error detected (code: ${errorCode}), retrying with ultra-minimal data`)
        queryType = 'ultra-minimal'
        const fallbackStart = Date.now()
        try {
          // Ultra-minimal fallback: Only absolutely essential fields (no nested relations)
          lead = await prisma.lead.findUnique({
            where: { id: numericId },
            select: {
              id: true,
              stage: true,
              pipelineStage: true,
              createdAt: true,
              contact: {
                select: {
                  id: true,
                  fullName: true,
                  phone: true,
                  email: true,
                  providedPhone: true,
                  providedPhoneE164: true,
                  providedEmail: true,
                }
              }
            },
          })
          const fallbackDuration = Date.now() - fallbackStart
          console.log(`[LEAD-API] [${requestId}] Ultra-minimal fallback query succeeded in ${fallbackDuration}ms`)
        } catch (ultraMinimalError: any) {
          const fallbackDuration = Date.now() - fallbackStart
          console.error(`[LEAD-API] [${requestId}] Ultra-minimal fallback also failed after ${fallbackDuration}ms:`, {
            errorCode: ultraMinimalError?.code || ultraMinimalError?.meta?.code,
            errorMessage: ultraMinimalError?.message?.substring(0, 200),
            leadId: numericId
          })
          // Never throw - return skeleton data instead
          queryType = 'skeleton'
          lead = {
            id: numericId,
            stage: 'NEW',
            pipelineStage: 'NEW',
            createdAt: new Date(),
            contact: {
              id: 0,
              fullName: 'Unknown',
              phone: '',
              email: '',
              providedPhone: null,
              providedPhoneE164: null,
              providedEmail: null,
            },
            _skeleton: true,
            _error: 'Unable to load lead data due to memory constraints'
          } as any
          console.log(`[LEAD-API] [${requestId}] Returning skeleton data for lead ${numericId}`)
        }
      } else {
        // Log non-memory errors for debugging
        console.error(`[LEAD-API] [${requestId}] Non-memory error, re-throwing:`, {
          errorCode,
          errorMessage: errorMessage.substring(0, 200),
          leadId: numericId
        })
        // Re-throw non-memory errors
        throw error
      }
    }
    
    // Log which query type was used
    if (queryType === 'ultra-minimal' || queryType === 'skeleton') {
      console.log(`[LEAD-API] [${requestId}] Using ${queryType} query results for lead ${numericId}`)
    }

    // PHASE 2: Split data loading - Load additional data separately if core query succeeded
    // Errors array already initialized at function start
    const loadAdditionalDataStart = Date.now()
    
    // Load additional data if we have a real lead (not skeleton)
    // This applies to both 'full' and 'ultra-minimal' query types
    if (lead && !(lead as any)._skeleton && queryType !== 'skeleton') {
      try {
        // Load additional data in separate queries using Promise.allSettled
        const [tasksResult, expiryItemsResult, conversationsResult, documentsResult, communicationLogsResult, notificationsResult] = await Promise.allSettled([
          // Tasks
          prisma.task.findMany({
            where: { leadId: numericId },
            orderBy: [
              { status: 'asc' },
              { dueAt: 'asc' }
            ],
            take: 20,
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              },
              createdByUser: {
                select: { id: true, name: true, email: true }
              }
            }
          }),
          // Expiry items
          prisma.expiryItem.findMany({
            where: { leadId: numericId },
            orderBy: { expiryDate: 'asc' },
            take: 20,
            include: {
              assignedUser: {
                select: { id: true, name: true, email: true }
              }
            }
          }),
          // Conversations
          prisma.conversation.findMany({
            where: { 
              leadId: numericId,
              deletedAt: null
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              channel: true,
              status: true,
              lastMessageAt: true,
              createdAt: true,
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  direction: true,
                  body: true,
                  createdAt: true,
                }
              }
            }
          }),
          // Documents
          prisma.document.findMany({
            where: { leadId: numericId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              uploadedByUser: {
                select: { id: true, name: true, email: true }
              }
            }
          }),
          // Communication logs
          prisma.communicationLog.findMany({
            where: { leadId: numericId },
            orderBy: { createdAt: 'desc' },
            take: 5
          }),
          // Notifications
          prisma.notification.findMany({
            where: { leadId: numericId },
            orderBy: { createdAt: 'desc' },
            take: 10
          })
        ])

        // Process results and track errors
        if (tasksResult.status === 'fulfilled') {
          (lead as any).tasks = tasksResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load tasks')
          }
          (lead as any).tasks = []
          console.error(`[LEAD-API] [${requestId}] Failed to load tasks:`, tasksResult.reason?.message)
        }

        if (expiryItemsResult.status === 'fulfilled') {
          (lead as any).expiryItems = expiryItemsResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load expiry items')
          }
          (lead as any).expiryItems = []
          console.error(`[LEAD-API] [${requestId}] Failed to load expiry items:`, expiryItemsResult.reason?.message)
        }

        if (conversationsResult.status === 'fulfilled') {
          (lead as any).conversations = conversationsResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load conversations')
          }
          (lead as any).conversations = []
          console.error(`[LEAD-API] [${requestId}] Failed to load conversations:`, conversationsResult.reason?.message)
        }

        if (documentsResult.status === 'fulfilled') {
          (lead as any).documents = documentsResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load documents')
          }
          (lead as any).documents = []
          console.error(`[LEAD-API] [${requestId}] Failed to load documents:`, documentsResult.reason?.message)
        }

        if (communicationLogsResult.status === 'fulfilled') {
          (lead as any).communicationLogs = communicationLogsResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load communication logs')
          }
          (lead as any).communicationLogs = []
          console.error(`[LEAD-API] [${requestId}] Failed to load communication logs:`, communicationLogsResult.reason?.message)
        }

        if (notificationsResult.status === 'fulfilled') {
          (lead as any).notifications = notificationsResult.value
        } else {
          if (errors && Array.isArray(errors)) {
            errors.push('Failed to load notifications')
          }
          (lead as any).notifications = []
          console.error(`[LEAD-API] [${requestId}] Failed to load notifications:`, notificationsResult.reason?.message)
        }

        // Load serviceType and assignedUser if not already loaded
        if (!lead.serviceType) {
          try {
            const serviceTypeResult = await prisma.serviceType.findFirst({
              where: { id: (lead as any).serviceTypeId },
              select: { id: true, name: true }
            })
            if (serviceTypeResult) {
              (lead as any).serviceType = serviceTypeResult
            }
          } catch (err: any) {
            if (errors && Array.isArray(errors)) {
              errors.push('Failed to load service type')
            }
            console.error(`[LEAD-API] [${requestId}] Failed to load service type:`, err.message)
          }
        }

        if (!lead.assignedUser && (lead as any).assignedUserId) {
          try {
            const assignedUserResult = await prisma.user.findUnique({
              where: { id: (lead as any).assignedUserId },
              select: { id: true, name: true, email: true }
            })
            if (assignedUserResult) {
              (lead as any).assignedUser = assignedUserResult
            }
          } catch (err: any) {
            if (errors && Array.isArray(errors)) {
              errors.push('Failed to load assigned user')
            }
            console.error(`[LEAD-API] [${requestId}] Failed to load assigned user:`, err.message)
          }
        }

        const additionalDataDuration = Date.now() - loadAdditionalDataStart
        if (errors && Array.isArray(errors) && errors.length > 0) {
          console.log(`[LEAD-API] [${requestId}] Loaded additional data in ${additionalDataDuration}ms with ${errors.length} errors`)
        } else {
          console.log(`[LEAD-API] [${requestId}] Loaded additional data in ${additionalDataDuration}ms successfully`)
        }
      } catch (additionalDataError: any) {
        console.error(`[LEAD-API] [${requestId}] Error loading additional data:`, additionalDataError.message)
        if (errors && Array.isArray(errors)) {
          errors.push('Failed to load some additional data')
        }
        // Set defaults for missing data (defensive check for lead existence)
        if (lead) {
          const leadAny = lead as any
          leadAny.tasks = leadAny.tasks || []
          leadAny.expiryItems = leadAny.expiryItems || []
          leadAny.conversations = leadAny.conversations || []
          leadAny.documents = leadAny.documents || []
          leadAny.communicationLogs = leadAny.communicationLogs || []
          leadAny.notifications = leadAny.notifications || []
        }
      }
    } else {
      // For skeleton or ultra-minimal queries, set empty defaults
      if (lead) {
        const leadAny = lead as any
        leadAny.tasks = []
        leadAny.expiryItems = []
        leadAny.conversations = []
        leadAny.documents = []
        leadAny.communicationLogs = []
        leadAny.notifications = []
      }
      if (queryType === 'skeleton' && errors && Array.isArray(errors)) {
        errors.push('Lead data unavailable due to memory constraints')
      }
    }

    // PHASE 2: Enhanced fallback resolution if lead not found
    // #region agent log
    console.log(`[LEAD-API] [${requestId}] Lead query result: ${lead ? `FOUND (id=${lead.id})` : 'NOT FOUND'}`)
    // #endregion
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
                take: 20,
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              documents: {
                orderBy: { createdAt: 'desc' },
                take: 10,
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
                take: 20,
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
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                  id: true,
                  channel: true,
                  status: true,
                  lastMessageAt: true,
                  createdAt: true,
                  messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
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
                take: 5,
              },
              // Removed duplicate messages loading
              notifications: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              }
            },
          })
          
          if (lead) {
            // Return redirect hint with preserved query params
            const redirectUrl = `/leads/${lead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
            const tasks = (lead as any).tasks || []
            return NextResponse.json({
              lead: {
                ...lead,
                _redirect: redirectUrl,
                _fallbackReason: 'Found via conversationId query param',
                tasksGrouped: {
                  open: tasks.filter((t: any) => t.status === 'OPEN') || [],
                  done: tasks.filter((t: any) => t.status === 'DONE') || [],
                  snoozed: tasks.filter((t: any) => t.status === 'SNOOZED') || [],
                }
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
                take: 20,
                include: {
                  assignedUser: {
                    select: { id: true, name: true, email: true }
                  }
                }
              },
              documents: {
                orderBy: { createdAt: 'desc' },
                take: 10,
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
                take: 20,
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
                where: { deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: {
                  id: true,
                  channel: true,
                  status: true,
                  lastMessageAt: true,
                  createdAt: true,
                  messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
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
                take: 5,
              },
              // Removed duplicate messages loading
              notifications: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              }
            },
          })
          
          if (latestLead) {
            console.log(`[API] Found latest lead ${latestLead.id} via contactId ${conversation.contactId}`)
            const redirectUrl = `/leads/${latestLead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
            const tasks = (latestLead as any).tasks || []
            return NextResponse.json({
              lead: {
                ...latestLead,
                _redirect: redirectUrl,
                _fallbackReason: 'Found latest lead via contactId',
                tasksGrouped: {
                  open: tasks.filter((t: any) => t.status === 'OPEN') || [],
                  done: tasks.filter((t: any) => t.status === 'DONE') || [],
                  snoozed: tasks.filter((t: any) => t.status === 'SNOOZED') || [],
                }
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
              take: 20,
              include: {
                assignedUser: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            documents: {
              orderBy: { createdAt: 'desc' },
              take: 10,
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
              take: 20,
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
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                channel: true,
                status: true,
                lastMessageAt: true,
                createdAt: true,
                messages: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
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
              take: 5,
            },
            // Removed duplicate messages loading
            notifications: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            }
          },
        })
        
        if (latestLead) {
          console.log(`[API] Found latest lead ${latestLead.id} via contactId ${contactId}`)
          const redirectUrl = `/leads/${latestLead.id}${action ? `?action=${action}` : ''}${searchParams.toString() ? `&${searchParams.toString()}` : ''}`
          const tasks = (latestLead as any).tasks || []
          return NextResponse.json({
            lead: {
              ...latestLead,
              _redirect: redirectUrl,
              _fallbackReason: 'Found latest lead via contactId',
              tasksGrouped: {
                open: tasks.filter((t: any) => t.status === 'OPEN') || [],
                done: tasks.filter((t: any) => t.status === 'DONE') || [],
                snoozed: tasks.filter((t: any) => t.status === 'SNOOZED') || [],
              }
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

    // Group tasks by status (defensive check for lead existence)
    if (!lead) {
      console.error(`[LEAD-API] [${requestId}] Lead is null/undefined after query`)
      return NextResponse.json(
        { 
          lead: {
            id: numericId,
            stage: 'NEW',
            contact: { id: 0, fullName: 'Unknown', phone: '', email: '' },
            tasks: [],
            expiryItems: [],
            conversations: [],
            documents: [],
            communicationLogs: [],
            notifications: [],
            _skeleton: true,
            _error: 'Lead data unavailable'
          },
          _errors: ['Lead not found'],
          _partial: true,
          _queryType: 'error'
        },
        { status: 200 }
      )
    }
    
    const tasks = (lead as any).tasks || []
    const tasksOpen = tasks.filter((t: any) => t.status === 'OPEN')
    const tasksDone = tasks.filter((t: any) => t.status === 'DONE')
    const tasksSnoozed = tasks.filter((t: any) => t.status === 'SNOOZED')

    const totalQueryDuration = Date.now() - dbQueryStart
    const hasErrors = (errors && Array.isArray(errors) && errors.length > 0) || queryType === 'skeleton' || queryType === 'ultra-minimal'
    const errorsCount = (errors && Array.isArray(errors)) ? errors.length : 0
    
    console.log(`[LEAD-API] [${requestId}] Successfully fetched lead ${lead?.id || numericId} (contact: ${lead?.contact?.fullName || 'N/A'}) using ${queryType} query in ${totalQueryDuration}ms${hasErrors ? ` with ${errorsCount} errors` : ''}`)

    const responseStart = Date.now()
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/leads/[id]/route.ts:459',message:'Preparing JSON response',data:{requestId:requestId,leadId:lead?.id||numericId,contactName:lead?.contact?.fullName||'null',tasksOpenCount:tasksOpen.length,tasksDoneCount:tasksDone.length,tasksSnoozedCount:tasksSnoozed.length,queryType:queryType,errorsCount:errorsCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BD'})}).catch(()=>{});
    console.log(`[LEAD-API] [${requestId}] Preparing response with lead.id=${lead?.id || numericId}, lead.contact=${lead?.contact?.fullName || 'null'}, queryType=${queryType}, errors=${errorsCount}`)
    // #endregion
    
    // Always return 200 with error metadata (never 500)
    const response = NextResponse.json({
      lead: {
        ...lead,
        tasks: tasks, // Preserve original tasks array
        tasksGrouped: {
          open: tasksOpen,
          done: tasksDone,
          snoozed: tasksSnoozed,
        },
        _queryType: queryType, // Include query type in response for debugging
      },
      _errors: (errors && Array.isArray(errors)) ? errors : [], // Array of error messages
      _partial: hasErrors, // Flag indicating partial data
    }, { status: 200 }) // Always 200, never 500
    
    const responseDuration = Date.now() - responseStart
    const totalDuration = Date.now() - requestStart
    
    console.log(`[LEAD-API] [${requestId}] Response prepared in ${responseDuration}ms, total: ${totalDuration}ms (query: ${totalQueryDuration}ms)`)
    return response
  } catch (error: any) {
    const totalDuration = requestStart ? Date.now() - requestStart : 0
    const errorRequestId = requestId || `error_${Date.now()}`
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/leads/[id]/route.ts:477',message:'GET /api/leads/[id] error caught',data:{requestId:errorRequestId,errorMessage:error?.message,errorName:error?.name,errorCode:error?.code,statusCode:error?.statusCode,totalDuration:totalDuration,stack:error?.stack?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'BA'})}).catch(()=>{});
    // #endregion
    console.error(`[LEAD-API] [${errorRequestId}] GET /api/leads/[id] error after ${totalDuration}ms:`, error.message)
    console.error(`[LEAD-API] [${errorRequestId}] Error stack:`, error.stack)
    
    // If it's an auth error, return 401
    if (error.statusCode === 401) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    // Always return 200 with error metadata instead of 500
    // This prevents frontend from showing error page and allows graceful handling
    return NextResponse.json(
      { 
        lead: {
          id: numericId,
          stage: 'NEW',
          contact: { id: 0, fullName: 'Unknown', phone: '', email: '' },
          tasks: [],
          expiryItems: [],
          conversations: [],
          documents: [],
          communicationLogs: [],
          notifications: [],
          _skeleton: true,
          _error: error?.message ?? 'Failed to fetch lead detail'
        },
        _errors: (errors && Array.isArray(errors)) ? [...errors, error?.message ?? 'Failed to fetch lead detail'] : [error?.message ?? 'Failed to fetch lead detail'],
        _partial: true,
        _queryType: 'error'
      },
      { status: 200 } // Always 200, never 500
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
    
    // Normalize service if provided
    if (body.serviceTypeEnum !== undefined || body.service !== undefined) {
      const serviceInput = body.serviceTypeEnum || body.service
      if (serviceInput) {
        const { normalizeService } = await import('@/lib/services/normalizeService')
        const normalized = normalizeService(serviceInput)
        updateData.serviceTypeEnum = normalized.service
        updateData.serviceOtherDescription = normalized.serviceOtherDescription
        // Also store raw input for reference
        if (normalized.service === 'OTHER') {
          updateData.requestedServiceRaw = serviceInput
        }
      } else {
        updateData.serviceTypeEnum = null
        updateData.serviceOtherDescription = null
      }
    }
    
    // Handle serviceTypeId (direct service type selection)
    if (body.serviceTypeId !== undefined) {
      if (body.serviceTypeId === null || body.serviceTypeId === '') {
        updateData.serviceTypeId = null
        // Also clear related fields when serviceTypeId is cleared
        updateData.leadType = null
      } else {
        const serviceTypeId = parseInt(String(body.serviceTypeId))
        if (isNaN(serviceTypeId)) {
          return NextResponse.json(
            { error: 'Invalid serviceTypeId' },
            { status: 400 }
          )
        }
        // Verify service type exists
        const serviceType = await prisma.serviceType.findUnique({
          where: { id: serviceTypeId }
        })
        if (!serviceType) {
          return NextResponse.json(
            { error: 'Service type not found' },
            { status: 404 }
          )
        }
        updateData.serviceTypeId = serviceTypeId
        updateData.leadType = serviceType.name
        // Optionally sync serviceTypeEnum if it exists
        if (serviceType.code) {
          updateData.serviceTypeEnum = serviceType.code
        }
      }
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
      // Trigger lead scoring for stage change (fire-and-forget)
      try {
        const { triggerLeadScoring } = await import('@/lib/ai/scoreTrigger')
        // Fire-and-forget - don't await, runs in background
        triggerLeadScoring(leadId, 'stage_change').catch((err) => {
          console.warn(`[LEAD-API] Failed to trigger scoring for lead ${leadId}:`, err.message)
        })
      } catch (error: any) {
        // Silent fail - don't block request
        console.warn(`[LEAD-API] Error importing scoreTrigger:`, error.message)
      }

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

    // #region agent log
    console.log(`[LEAD-API] PATCH response: returning lead.id=${lead.id}`)
    // #endregion
    return NextResponse.json({ lead })
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
      { status: 200 } // Always return 200, never 500
    )
  }
}




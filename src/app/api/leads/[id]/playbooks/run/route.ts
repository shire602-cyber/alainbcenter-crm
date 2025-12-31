/**
 * POST /api/leads/[id]/playbooks/run
 * 
 * Execute a playbook for a lead
 * - Loads lead + conversation
 * - Renders template with knownFields
 * - Sends message via existing messaging pipeline
 * - Creates tasks + updates stage (transaction)
 * - Logs activity event
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { executePlaybook, type PlaybookKey } from '@/lib/leads/playbooks'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)
    
    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }
    
    const body = await req.json()
    const { playbookKey, channel = 'whatsapp', dryRun = false } = body
    
    if (!playbookKey) {
      return NextResponse.json(
        { ok: false, error: 'playbookKey is required' },
        { status: 400 }
      )
    }
    
    // Load lead with conversation
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        serviceType: true,
        conversations: {
          where: { 
            channel: channel.toLowerCase(),
            deletedAt: null,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    
    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }
    
    // Load conversation state to get knownFields
    let knownFields: Record<string, any> = {}
    const conversation = lead.conversations[0]
    
    if (conversation) {
      try {
        const knownFieldsJson = (conversation as any).knownFields
        if (knownFieldsJson) {
          knownFields = typeof knownFieldsJson === 'string' 
            ? JSON.parse(knownFieldsJson) 
            : knownFieldsJson
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Execute playbook
    const playbookResult = executePlaybook(playbookKey as PlaybookKey, {
      lead: {
        id: lead.id,
        stage: lead.stage,
        serviceType: lead.serviceType,
        contact: lead.contact,
      },
      knownFields,
      conversationId: conversation?.id,
    })
    
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        playbookResult,
      })
    }
    
    // Execute playbook actions in a transaction
    const result = await prisma.$transaction(async (tx) => {
      let messageId: number | null = null
      
      // 1. Send message if conversation exists
      if (conversation && lead.contact?.phone) {
        try {
          const sendResult = await sendOutboundWithIdempotency({
            conversationId: conversation.id,
            leadId: lead.id,
            contactId: lead.contact.id,
            phone: lead.contact.phone,
            text: playbookResult.messageBody,
            provider: channel.toLowerCase() as 'whatsapp' | 'email' | 'instagram' | 'facebook',
            triggerProviderMessageId: `playbook-${playbookKey}-${Date.now()}`,
            replyType: 'manual',
          })
          
          messageId = sendResult.outboundLogId || null
        } catch (error: any) {
          console.error(`[PLAYBOOK] Failed to send message:`, error)
          // Continue with tasks even if message fails
        }
      }
      
      // 2. Create tasks
      const createdTasks = []
      for (const task of playbookResult.tasksToCreate) {
        const created = await tx.task.create({
          data: {
            leadId: lead.id,
            title: task.title,
            type: task.type,
            dueAt: task.dueAt,
            status: 'OPEN',
            createdByUserId: (await requireAuthApi()).id,
          },
        })
        createdTasks.push(created)
      }
      
      // 3. Update stage if needed
      if (playbookResult.stageUpdate) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { stage: playbookResult.stageUpdate },
        })
      }
      
      // 4. Log activity event (use CommunicationLog)
      await tx.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'internal',
          direction: 'outbound',
          messageSnippet: playbookResult.activityEvent.description.substring(0, 100),
          body: playbookResult.activityEvent.description,
          meta: playbookResult.activityEvent.metadata ? JSON.stringify(playbookResult.activityEvent.metadata) : null,
        },
      })
      
      return {
        messageId,
        tasksCreated: createdTasks.length,
        stageUpdated: !!playbookResult.stageUpdate,
      }
    })
    
    return NextResponse.json({
      ok: true,
      playbookKey,
      result,
      message: `Playbook "${playbookKey}" executed successfully`,
    })
  } catch (error: any) {
    console.error('[PLAYBOOK] Error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to execute playbook' },
      { status: 500 }
    )
  }
}


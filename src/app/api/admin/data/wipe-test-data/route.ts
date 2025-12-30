/**
 * WIPE TEST DATA - Hard Delete for Testing
 * 
 * This endpoint allows admins to completely wipe test data to reset AI behavior.
 * Use this when you want to test AI responses from scratch without previous context.
 * 
 * DELETE /api/admin/data/wipe-test-data?contactId=123
 * DELETE /api/admin/data/wipe-test-data?conversationId=456
 * DELETE /api/admin/data/wipe-test-data?leadId=789
 * DELETE /api/admin/data/wipe-test-data?phone=+971501234567
 * 
 * What gets deleted/cleared:
 * - All messages (inbound and outbound)
 * - All OutboundJobs
 * - Conversation state (knownFields, ruleEngineMemory, collectedData, aiStateJson, flowKey, flowStep, etc.)
 * - OutboundMessageLogs
 * - CommunicationLogs
 * - AutoReplyLogs
 * - ReplyEngineLogs
 * - Optionally: Lead and Conversation (if specified)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function DELETE(req: NextRequest) {
  try {
    await requireAdminApi()
    
    const searchParams = req.nextUrl.searchParams
    const contactIdParam = searchParams.get('contactId')
    const conversationIdParam = searchParams.get('conversationId')
    const leadIdParam = searchParams.get('leadId')
    const phoneParam = searchParams.get('phone')
    const deleteLead = searchParams.get('deleteLead') === 'true' // Optional: also delete lead
    const deleteConversation = searchParams.get('deleteConversation') === 'true' // Optional: also delete conversation
    
    if (!contactIdParam && !conversationIdParam && !leadIdParam && !phoneParam) {
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Must provide one of: contactId, conversationId, leadId, or phone' 
        },
        { status: 400 }
      )
    }
    
    const deletionLog: string[] = []
    let contactId: number | null = null
    let conversationId: number | null = null
    let leadId: number | null = null
    
    // Resolve identifiers
    if (phoneParam) {
      const contact = await prisma.contact.findFirst({
        where: {
          OR: [
            { phone: phoneParam },
            { phoneNormalized: phoneParam },
          ],
        },
        select: { id: true },
      })
      if (!contact) {
        return NextResponse.json(
          { ok: false, error: `Contact not found for phone: ${phoneParam}` },
          { status: 404 }
        )
      }
      contactId = contact.id
    } else if (contactIdParam) {
      contactId = parseInt(contactIdParam)
      if (isNaN(contactId)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid contactId' },
          { status: 400 }
        )
      }
    }
    
    if (conversationIdParam) {
      conversationId = parseInt(conversationIdParam)
      if (isNaN(conversationId)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid conversationId' },
          { status: 400 }
        )
      }
    }
    
    if (leadIdParam) {
      leadId = parseInt(leadIdParam)
      if (isNaN(leadId)) {
        return NextResponse.json(
          { ok: false, error: 'Invalid leadId' },
          { status: 400 }
        )
      }
    }
    
    // If we have contactId, get conversations
    if (contactId && !conversationId) {
      const conversations = await prisma.conversation.findMany({
        where: { contactId },
        select: { id: true },
      })
      if (conversations.length > 0) {
        conversationId = conversations[0].id // Use first conversation, or handle multiple
      }
    }
    
    // If we have conversationId, get leadId
    if (conversationId && !leadId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { leadId: true },
      })
      if (conversation?.leadId) {
        leadId = conversation.leadId
      }
    }
    
    console.log(`🗑️ [WIPE-TEST-DATA] Starting wipe contactId=${contactId} conversationId=${conversationId} leadId=${leadId}`)
    
    // 1. Delete OutboundJobs (linked to conversation)
    if (conversationId) {
      const outboundJobCount = await prisma.outboundJob.deleteMany({
        where: { conversationId },
      })
      deletionLog.push(`Deleted ${outboundJobCount.count} outbound job(s)`)
    } else if (leadId) {
      // Delete via conversations
      const conversations = await prisma.conversation.findMany({
        where: { leadId },
        select: { id: true },
      })
      for (const conv of conversations) {
        const count = await prisma.outboundJob.deleteMany({
          where: { conversationId: conv.id },
        })
        if (count.count > 0) {
          deletionLog.push(`Deleted ${count.count} outbound job(s) from conversation ${conv.id}`)
        }
      }
    }
    
    // 2. Delete Messages (linked to conversation or lead)
    if (conversationId) {
      const messageCount = await prisma.message.deleteMany({
        where: { conversationId },
      })
      deletionLog.push(`Deleted ${messageCount.count} message(s)`)
    } else if (leadId) {
      const messageCount = await prisma.message.deleteMany({
        where: { leadId },
      })
      deletionLog.push(`Deleted ${messageCount.count} message(s)`)
    }
    
    // 3. Delete OutboundMessageLogs (via conversation)
    if (conversationId) {
      const outboundLogCount = await prisma.outboundMessageLog.deleteMany({
        where: { conversationId },
      })
      deletionLog.push(`Deleted ${outboundLogCount.count} outbound message log(s)`)
    } else if (leadId) {
      const conversations = await prisma.conversation.findMany({
        where: { leadId },
        select: { id: true },
      })
      for (const conv of conversations) {
        const count = await prisma.outboundMessageLog.deleteMany({
          where: { conversationId: conv.id },
        })
        if (count.count > 0) {
          deletionLog.push(`Deleted ${count.count} outbound message log(s) from conversation ${conv.id}`)
        }
      }
    }
    
    // 4. Delete CommunicationLogs
    if (conversationId) {
      const commLogCount = await prisma.communicationLog.deleteMany({
        where: { conversationId },
      })
      deletionLog.push(`Deleted ${commLogCount.count} communication log(s)`)
    } else if (leadId) {
      const commLogCount = await prisma.communicationLog.deleteMany({
        where: { leadId },
      })
      deletionLog.push(`Deleted ${commLogCount.count} communication log(s)`)
    }
    
    // 5. Delete AutoReplyLogs
    if (leadId) {
      const autoReplyCount = await prisma.autoReplyLog.deleteMany({
        where: { leadId },
      })
      deletionLog.push(`Deleted ${autoReplyCount.count} auto reply log(s)`)
    }
    
    // 6. Delete ReplyEngineLogs
    if (conversationId) {
      const replyEngineCount = await prisma.replyEngineLog.deleteMany({
        where: { conversationId },
      })
      deletionLog.push(`Deleted ${replyEngineCount.count} reply engine log(s)`)
    }
    
    // 7. Clear Conversation State (CRITICAL for AI reset)
    if (conversationId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          knownFields: null,
          ruleEngineMemory: null,
          collectedData: null,
          aiStateJson: null,
          flowKey: null,
          flowStep: null,
          lastQuestionKey: null,
          lastQuestionAt: null,
          lastAutoReplyKey: null,
          stateVersion: 0,
          lastMessageAt: new Date(),
          lastInboundAt: null,
          lastOutboundAt: null,
          needsReplySince: null,
          slaBreachAt: null,
          unreadCount: 0,
        },
      })
      deletionLog.push(`Cleared conversation state for conversation ${conversationId}`)
    } else if (contactId) {
      const conversations = await prisma.conversation.findMany({
        where: { contactId },
        select: { id: true },
      })
      for (const conv of conversations) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            knownFields: null,
            ruleEngineMemory: null,
            collectedData: null,
            aiStateJson: null,
            flowKey: null,
            flowStep: null,
            lastQuestionKey: null,
            lastQuestionAt: null,
            lastAutoReplyKey: null,
            stateVersion: 0,
            lastMessageAt: new Date(),
            lastInboundAt: null,
            lastOutboundAt: null,
            needsReplySince: null,
            slaBreachAt: null,
            unreadCount: 0,
          },
        })
      }
      deletionLog.push(`Cleared conversation state for ${conversations.length} conversation(s)`)
    }
    
    // 8. Optionally delete Lead
    if (deleteLead && leadId) {
      // Delete related data first
      await prisma.autoReplyLog.deleteMany({ where: { leadId } })
      await prisma.task.deleteMany({ where: { leadId } })
      await prisma.document.deleteMany({ where: { leadId } })
      await prisma.reminder.deleteMany({ where: { leadId } })
      await prisma.automationRunLog.deleteMany({ where: { leadId } })
      await prisma.aIDraft.deleteMany({ where: { leadId } })
      await prisma.aIActionLog.deleteMany({ where: { leadId } })
      await prisma.notification.deleteMany({ where: { leadId } })
      
      await prisma.lead.delete({
        where: { id: leadId },
      })
      deletionLog.push(`Deleted lead ${leadId}`)
    }
    
    // 9. Optionally delete Conversation
    if (deleteConversation && conversationId) {
      await prisma.conversation.delete({
        where: { id: conversationId },
      })
      deletionLog.push(`Deleted conversation ${conversationId}`)
    }
    
    console.log(`✅ [WIPE-TEST-DATA] Successfully wiped test data`)
    
    return NextResponse.json({
      ok: true,
      message: 'Test data wiped successfully',
      deletionLog,
      wiped: {
        contactId,
        conversationId,
        leadId,
      },
    })
  } catch (error: any) {
    console.error(`❌ [WIPE-TEST-DATA] Error:`, error)
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to wipe test data',
        code: error.code || 'WIPE_ERROR',
      },
      { status: 500 }
    )
  }
}


/**
 * Diagnostic endpoint to check Instagram conversation/message creation
 * GET /api/inbox/debug-instagram
 * Returns diagnostic information about Instagram conversations and messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    // Check for Instagram conversations
    const instagramConversations = await prisma.conversation.findMany({
      where: {
        channel: 'instagram',
      },
      select: {
        id: true,
        channel: true,
        status: true,
        lastMessageAt: true,
        createdAt: true,
        contactId: true,
        leadId: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
      take: 10,
    })

    // Check for Instagram messages
    const instagramMessages = await prisma.message.findMany({
      where: {
        channel: 'instagram',
      },
      select: {
        id: true,
        channel: true,
        direction: true,
        body: true,
        providerMessageId: true,
        conversationId: true,
        createdAt: true,
        conversation: {
          select: {
            id: true,
            channel: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    })

    // Check for Instagram contacts (phone starts with 'ig:')
    const instagramContacts = await prisma.contact.findMany({
      where: {
        phone: {
          startsWith: 'ig:',
        },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        source: true,
        _count: {
          select: {
            conversations: true,
            leads: true,
          },
        },
      },
      take: 10,
    })

    // Check recent webhook events
    const recentWebhookEvents = await prisma.metaWebhookEvent.findMany({
      where: {
        eventType: 'instagram',
      },
      select: {
        id: true,
        eventType: true,
        receivedAt: true,
      },
      orderBy: {
        receivedAt: 'desc',
      },
      take: 10,
    })

    return NextResponse.json({
      success: true,
      diagnostics: {
        conversations: {
          count: instagramConversations.length,
          list: instagramConversations.map(conv => ({
            id: conv.id,
            channel: conv.channel,
            status: conv.status,
            lastMessageAt: conv.lastMessageAt,
            createdAt: conv.createdAt,
            contactId: conv.contactId,
            leadId: conv.leadId,
            contactName: conv.contact.fullName,
            contactPhone: conv.contact.phone,
            messageCount: conv._count.messages,
          })),
        },
        messages: {
          count: instagramMessages.length,
          list: instagramMessages.map(msg => ({
            id: msg.id,
            channel: msg.channel,
            direction: msg.direction,
            bodyPreview: msg.body ? msg.body.substring(0, 50) : null,
            providerMessageId: msg.providerMessageId,
            conversationId: msg.conversationId,
            conversationChannel: msg.conversation?.channel,
            createdAt: msg.createdAt,
          })),
        },
        contacts: {
          count: instagramContacts.length,
          list: instagramContacts.map(contact => ({
            id: contact.id,
            fullName: contact.fullName,
            phone: contact.phone,
            source: contact.source,
            conversationCount: contact._count.conversations,
            leadCount: contact._count.leads,
          })),
        },
        webhookEvents: {
          count: recentWebhookEvents.length,
          list: recentWebhookEvents.map(event => ({
            id: event.id,
            eventType: event.eventType,
            receivedAt: event.receivedAt,
          })),
        },
      },
      analysis: {
        hasConversations: instagramConversations.length > 0,
        hasMessages: instagramMessages.length > 0,
        hasContacts: instagramContacts.length > 0,
        hasWebhookEvents: recentWebhookEvents.length > 0,
        potentialIssues: [
          !instagramContacts.length && 'No Instagram contacts found (phone should start with ig:)',
          !instagramConversations.length && instagramContacts.length > 0 && 'Contacts exist but no conversations created',
          !instagramMessages.length && instagramConversations.length > 0 && 'Conversations exist but no messages created',
          instagramMessages.length > 0 && instagramConversations.length === 0 && 'Messages exist but no conversations (orphaned messages)',
          recentWebhookEvents.length > 0 && !instagramMessages.length && 'Webhook events received but no messages created',
        ].filter(Boolean),
      },
    })
  } catch (error: any) {
    console.error('Error in debug-instagram endpoint:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}


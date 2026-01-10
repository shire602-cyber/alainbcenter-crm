import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/inbox/debug-instagram-full
 * Comprehensive diagnostic endpoint for Instagram message processing
 * Shows complete pipeline state from webhooks to inbox
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const results: any = {
      timestamp: new Date().toISOString(),
      webhookEvents: [],
      contacts: [],
      leads: [],
      conversations: [],
      messages: [],
      connections: [],
      analysis: {},
    }

    // 1. Check Meta connections
    results.connections = await prisma.metaConnection.findMany({
      where: {
        igBusinessId: { not: null },
      },
      select: {
        id: true,
        workspaceId: true,
        pageId: true,
        pageName: true,
        igBusinessId: true,
        igUsername: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    // 2. Check recent Instagram webhook events
    results.webhookEvents = await prisma.metaWebhookEvent.findMany({
      where: {
        eventType: 'instagram',
      },
      select: {
        id: true,
        connectionId: true,
        workspaceId: true,
        pageId: true,
        eventType: true,
        receivedAt: true,
        payload: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    })

    // 3. Check for Instagram contacts (using 'ig:' prefix in phone)
    results.contacts = await prisma.contact.findMany({
      where: {
        phone: { startsWith: 'ig:' },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // 4. Check for Instagram leads
    results.leads = await prisma.lead.findMany({
      where: {
        lastContactChannel: 'instagram',
      },
      select: {
        id: true,
        contactId: true,
        status: true,
        stage: true,
        lastContactChannel: true,
        lastInboundAt: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // 5. Check for Instagram conversations
    results.conversations = await prisma.conversation.findMany({
      where: { channel: 'instagram' },
      select: {
        id: true,
        contactId: true,
        leadId: true,
        channel: true,
        status: true,
        lastMessageAt: true,
        lastInboundAt: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
        lead: {
          select: {
            id: true,
            status: true,
            lastContactChannel: true,
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 20,
    })

    // 6. Check for Instagram messages
    results.messages = await prisma.message.findMany({
      where: { channel: 'instagram' },
      select: {
        id: true,
        conversationId: true,
        direction: true,
        body: true,
        channel: true,
        createdAt: true,
        conversation: {
          select: {
            id: true,
            contactId: true,
            channel: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // 7. Analysis
    results.analysis = {
      hasConnections: results.connections.length > 0,
      connectionCount: results.connections.length,
      hasWebhookEvents: results.webhookEvents.length > 0,
      webhookEventCount: results.webhookEvents.length,
      hasContacts: results.contacts.length > 0,
      contactCount: results.contacts.length,
      hasLeads: results.leads.length > 0,
      leadCount: results.leads.length,
      hasConversations: results.conversations.length > 0,
      conversationCount: results.conversations.length,
      hasMessages: results.messages.length > 0,
      messageCount: results.messages.length,
      
      // Pipeline state analysis
      webhooksButNoContacts: results.webhookEvents.length > 0 && results.contacts.length === 0,
      contactsButNoLeads: results.contacts.length > 0 && results.leads.length === 0,
      leadsButNoConversations: results.leads.length > 0 && results.conversations.length === 0,
      conversationsButNoMessages: results.conversations.length > 0 && results.messages.length === 0,
      
      // Connection analysis
      connectionsWithEvents: results.connections.filter((conn: any) => 
        results.webhookEvents.some((evt: any) => evt.connectionId === conn.id)
      ).length,
      
      // Latest timestamps
      latestWebhookEvent: results.webhookEvents[0]?.receivedAt || null,
      latestContact: results.contacts[0]?.createdAt || null,
      latestLead: results.leads[0]?.createdAt || null,
      latestConversation: results.conversations[0]?.createdAt || null,
      latestMessage: results.messages[0]?.createdAt || null,
    }

    // 8. Determine issue
    if (!results.analysis.hasWebhookEvents) {
      results.analysis.issue = 'No Instagram webhook events received. Check Meta Developer Console webhook setup.'
    } else if (!results.analysis.hasConnections) {
      results.analysis.issue = 'Webhook events received, but no Meta connections found with igBusinessId. Verify connection was created correctly.'
    } else if (results.analysis.webhooksButNoContacts) {
      results.analysis.issue = 'Webhook events received, but no Instagram contacts created. Check normalization and processInboundMessage logs.'
    } else if (results.analysis.contactsButNoLeads) {
      results.analysis.issue = 'Contacts created, but no leads. Check handleInboundMessageAutoMatch -> findOrCreateLead logs for errors.'
    } else if (results.analysis.leadsButNoConversations) {
      results.analysis.issue = 'Leads created, but no conversations. Check handleInboundMessageAutoMatch -> upsertConversation logs.'
    } else if (results.analysis.conversationsButNoMessages) {
      results.analysis.issue = 'Conversations created, but no messages. Check handleInboundMessageAutoMatch -> createCommunicationLog logs.'
    } else if (results.analysis.hasMessages && results.analysis.hasConversations) {
      results.analysis.issue = 'Messages and conversations exist. Check inbox API filtering or frontend display logic.'
    } else {
      results.analysis.issue = 'Unknown issue - check all logs for errors'
    }

    return NextResponse.json({ success: true, ...results })
  } catch (error: any) {
    console.error('Error in Instagram full debug endpoint:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}


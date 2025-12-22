import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // Get all contacts with leads and communication logs
    const contacts = await prisma.contact.findMany({
      include: {
        leads: {
          include: {
            serviceType: true,
            communicationLogs: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 1, // Latest lead per contact
        },
      },
    })

    // Transform to conversation format
    const conversations = await Promise.all(
      contacts
        .filter((contact) => contact.leads.length > 0)
        .map(async (contact) => {
          const latestLead = contact.leads[0]
          const lastLog = latestLead.communicationLogs[0]

          // Calculate unread count from all communication logs for this lead
          const unreadCount = await prisma.communicationLog.count({
            where: {
              leadId: latestLead.id,
              direction: 'inbound',
              isRead: false,
            },
          })

          return {
            contactId: contact.id,
            contact: {
              id: contact.id,
              fullName: contact.fullName,
              phone: contact.phone,
              email: contact.email,
            },
            lastMessageAt: lastLog?.createdAt || latestLead.createdAt,
            lastMessagePreview: lastLog?.messageSnippet || null,
            unreadCount,
            lead: {
              id: latestLead.id,
              leadType: latestLead.leadType,
              serviceType: latestLead.serviceType?.name || null,
              status: latestLead.status,
              pipelineStage: latestLead.pipelineStage,
              expiryDate: latestLead.expiryDate,
              aiScore: latestLead.aiScore,
            },
          }
        })
    )

    // Sort by last message date
    conversations.sort((a, b) => {
      const dateA = new Date(a.lastMessageAt).getTime()
      const dateB = new Date(b.lastMessageAt).getTime()
      return dateB - dateA
    })

    return NextResponse.json(conversations)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load inbox' },
      { status: error.statusCode || 500 }
    )
  }
}


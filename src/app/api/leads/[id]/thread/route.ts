/**
 * GET /api/leads/[id]/thread
 * Returns conversation thread (messages + timeline events) for lead cockpit
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

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

    // Get optional channel filter
    const searchParams = req.nextUrl.searchParams
    const channel = searchParams.get('channel')?.toUpperCase()

    // Fetch lead with conversations
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        conversations: channel ? {
          where: { channel },
        } : true,
      },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Get all messages for this lead (or filtered by channel)
    const where: any = { leadId }
    if (channel) {
      where.channel = channel
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        conversation: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Get communication logs
    const communicationLogs = await prisma.communicationLog.findMany({
      where: {
        leadId,
        ...(channel && { channel }),
      },
      orderBy: { createdAt: 'asc' },
    })

    // Get tasks (for timeline)
    const tasks = await prisma.task.findMany({
      where: { leadId },
      include: {
        assignedUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Combine into timeline (messages + logs + tasks)
    const timeline = [
      ...messages.map(msg => ({
        type: 'message' as const,
        id: msg.id,
        direction: msg.direction,
        channel: msg.channel,
        body: msg.body,
        createdAt: msg.createdAt,
        createdBy: msg.createdByUser,
        status: msg.status,
      })),
      ...communicationLogs.map(log => ({
        type: 'log' as const,
        id: log.id,
        channel: log.channel,
        direction: log.direction,
        messageSnippet: log.messageSnippet,
        createdAt: log.createdAt,
      })),
      ...tasks.map(task => ({
        type: 'task' as const,
        id: task.id,
        title: task.title,
        taskType: task.type,
        status: task.status,
        dueAt: task.dueAt,
        createdAt: task.createdAt,
        assignedUser: task.assignedUser,
        createdBy: task.createdByUser,
      })),
    ].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    return NextResponse.json({
      messages,
      timeline,
      conversations: lead.conversations,
    })
  } catch (error: any) {
    console.error('GET /api/leads/[id]/thread error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


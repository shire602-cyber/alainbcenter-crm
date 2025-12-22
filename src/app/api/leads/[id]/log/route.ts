import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/leads/[id]/log
// Append a communication log entry to a lead
export async function POST(
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

    const body = await req.json()

    // Validate required fields
    if (!body.channel || !body.direction) {
      return NextResponse.json(
        { error: 'Missing required fields: channel and direction are required' },
        { status: 400 }
      )
    }

    // Validate channel
    const allowedChannels = ['whatsapp', 'email', 'phone', 'internal']
    if (!allowedChannels.includes(body.channel)) {
      return NextResponse.json(
        { error: `Invalid channel. Must be one of: ${allowedChannels.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate direction
    const allowedDirections = ['outbound', 'inbound']
    if (!allowedDirections.includes(body.direction)) {
      return NextResponse.json(
        { error: `Invalid direction. Must be one of: ${allowedDirections.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Create communication log entry
    // Use messageSnippet if provided, otherwise use first 200 chars of message
    const snippet = body.messageSnippet || 
                    (body.message ? body.message.substring(0, 200) : null)
    
    const logEntry = await prisma.communicationLog.create({
      data: {
        leadId,
        channel: body.channel,
        direction: body.direction,
        messageSnippet: snippet,
      },
    })

    return NextResponse.json(logEntry, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/leads/[id]/log error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in POST /api/leads/[id]/log' },
      { status: 500 }
    )
  }
}

// GET /api/leads/[id]/log
// Get all communication logs for a lead
export async function GET(
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

    const logs = await prisma.communicationLog.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(logs)
  } catch (error: any) {
    console.error('GET /api/leads/[id]/log error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in GET /api/leads/[id]/log' },
      { status: 500 }
    )
  }
}




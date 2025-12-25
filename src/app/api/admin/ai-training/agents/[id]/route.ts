import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/ai-training/agents/[id]
 * Get a single AI agent profile
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const { id } = await params
    const agentId = parseInt(id)

    if (isNaN(agentId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid agent ID' },
        { status: 400 }
      )
    }

    const agent = await prisma.aIAgentProfile.findUnique({
      where: { id: agentId },
    })

    if (!agent) {
      return NextResponse.json(
        { ok: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      ok: true,
      agent,
    })
  } catch (error: any) {
    console.error('GET /api/admin/ai-training/agents/[id] error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch agent' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/ai-training/agents/[id]
 * Update an AI agent profile
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const { id } = await params
    const agentId = parseInt(id)
    const body = await req.json()

    if (isNaN(agentId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid agent ID' },
        { status: 400 }
      )
    }

    const existingAgent = await prisma.aIAgentProfile.findUnique({
      where: { id: agentId },
    })

    if (!existingAgent) {
      return NextResponse.json(
        { ok: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    // If setting as default, unset other defaults
    if (body.isDefault && !existingAgent.isDefault) {
      await prisma.aIAgentProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    // Convert arrays to JSON strings
    const updateData: any = {}
    
    if (body.name !== undefined) updateData.name = body.name.trim()
    if (body.description !== undefined) updateData.description = body.description?.trim() || null
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.isDefault !== undefined) updateData.isDefault = body.isDefault
    if (body.systemPrompt !== undefined) updateData.systemPrompt = body.systemPrompt?.trim() || null
    if (body.tone !== undefined) updateData.tone = body.tone
    if (body.maxMessageLength !== undefined) updateData.maxMessageLength = body.maxMessageLength
    if (body.maxTotalLength !== undefined) updateData.maxTotalLength = body.maxTotalLength
    if (body.maxQuestionsPerMessage !== undefined) updateData.maxQuestionsPerMessage = body.maxQuestionsPerMessage
    if (body.customGreeting !== undefined) updateData.customGreeting = body.customGreeting?.trim() || null
    if (body.customSignoff !== undefined) updateData.customSignoff = body.customSignoff?.trim() || null
    if (body.responseDelayMin !== undefined) updateData.responseDelayMin = body.responseDelayMin
    if (body.responseDelayMax !== undefined) updateData.responseDelayMax = body.responseDelayMax
    if (body.rateLimitMinutes !== undefined) updateData.rateLimitMinutes = body.rateLimitMinutes
    if (body.businessHoursStart !== undefined) updateData.businessHoursStart = body.businessHoursStart
    if (body.businessHoursEnd !== undefined) updateData.businessHoursEnd = body.businessHoursEnd
    if (body.timezone !== undefined) updateData.timezone = body.timezone
    if (body.allowOutsideHours !== undefined) updateData.allowOutsideHours = body.allowOutsideHours
    if (body.firstMessageImmediate !== undefined) updateData.firstMessageImmediate = body.firstMessageImmediate
    if (body.similarityThreshold !== undefined) updateData.similarityThreshold = body.similarityThreshold
    if (body.confidenceThreshold !== undefined) updateData.confidenceThreshold = body.confidenceThreshold
    if (body.defaultLanguage !== undefined) updateData.defaultLanguage = body.defaultLanguage
    if (body.autoDetectLanguage !== undefined) updateData.autoDetectLanguage = body.autoDetectLanguage

    // Handle array fields
    if (body.trainingDocumentIds !== undefined) {
      updateData.trainingDocumentIds = body.trainingDocumentIds && Array.isArray(body.trainingDocumentIds)
        ? JSON.stringify(body.trainingDocumentIds)
        : null
    }
    if (body.allowedPhrases !== undefined) {
      updateData.allowedPhrases = body.allowedPhrases && Array.isArray(body.allowedPhrases)
        ? JSON.stringify(body.allowedPhrases)
        : body.allowedPhrases && typeof body.allowedPhrases === 'string' && body.allowedPhrases.trim()
          ? JSON.stringify(body.allowedPhrases.split('\n').filter((p: string) => p.trim()))
          : null
    }
    if (body.prohibitedPhrases !== undefined) {
      updateData.prohibitedPhrases = body.prohibitedPhrases && Array.isArray(body.prohibitedPhrases)
        ? JSON.stringify(body.prohibitedPhrases)
        : body.prohibitedPhrases && typeof body.prohibitedPhrases === 'string' && body.prohibitedPhrases.trim()
          ? JSON.stringify(body.prohibitedPhrases.split('\n').filter((p: string) => p.trim()))
          : null
    }
    if (body.escalateToHumanRules !== undefined) {
      updateData.escalateToHumanRules = body.escalateToHumanRules && Array.isArray(body.escalateToHumanRules)
        ? JSON.stringify(body.escalateToHumanRules)
        : body.escalateToHumanRules && typeof body.escalateToHumanRules === 'string' && body.escalateToHumanRules.trim()
          ? JSON.stringify(body.escalateToHumanRules.split('\n').filter((p: string) => p.trim()))
          : null
    }
    if (body.skipAutoReplyRules !== undefined) {
      updateData.skipAutoReplyRules = body.skipAutoReplyRules && Array.isArray(body.skipAutoReplyRules)
        ? JSON.stringify(body.skipAutoReplyRules)
        : body.skipAutoReplyRules && typeof body.skipAutoReplyRules === 'string' && body.skipAutoReplyRules.trim()
          ? JSON.stringify(body.skipAutoReplyRules.split('\n').filter((p: string) => p.trim()))
          : null
    }

    const agent = await prisma.aIAgentProfile.update({
      where: { id: agentId },
      data: updateData,
    })

    return NextResponse.json({
      ok: true,
      agent,
    })
  } catch (error: any) {
    console.error('PUT /api/admin/ai-training/agents/[id] error:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'An agent with this name already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to update agent' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/ai-training/agents/[id]
 * Delete an AI agent profile
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminApi()

    const { id } = await params
    const agentId = parseInt(id)

    if (isNaN(agentId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid agent ID' },
        { status: 400 }
      )
    }

    const agent = await prisma.aIAgentProfile.findUnique({
      where: { id: agentId },
    })

    if (!agent) {
      return NextResponse.json(
        { ok: false, error: 'Agent not found' },
        { status: 404 }
      )
    }

    if (agent.isDefault) {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete the default agent. Please set another agent as default first.' },
        { status: 400 }
      )
    }

    await prisma.aIAgentProfile.delete({
      where: { id: agentId },
    })

    return NextResponse.json({
      ok: true,
      message: 'Agent deleted successfully',
    })
  } catch (error: any) {
    console.error('DELETE /api/admin/ai-training/agents/[id] error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to delete agent' },
      { status: 500 }
    )
  }
}


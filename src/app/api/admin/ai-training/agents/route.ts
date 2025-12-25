import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/ai-training/agents
 * List all AI agent profiles
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminApi()

    const agents = await prisma.aIAgentProfile.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json({
      ok: true,
      agents,
    })
  } catch (error: any) {
    console.error('GET /api/admin/ai-training/agents error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to fetch agents' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/ai-training/agents
 * Create a new AI agent profile
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const {
      name,
      description,
      isActive = true,
      isDefault = false,
      trainingDocumentIds,
      systemPrompt,
      tone = 'friendly',
      maxMessageLength = 300,
      maxTotalLength = 600,
      maxQuestionsPerMessage = 2,
      allowedPhrases,
      prohibitedPhrases,
      customGreeting,
      customSignoff,
      responseDelayMin = 0,
      responseDelayMax = 5,
      rateLimitMinutes = 2,
      businessHoursStart = '07:00',
      businessHoursEnd = '21:30',
      timezone = 'Asia/Dubai',
      allowOutsideHours = false,
      firstMessageImmediate = true,
      similarityThreshold = 0.7,
      confidenceThreshold = 50,
      escalateToHumanRules,
      skipAutoReplyRules,
      defaultLanguage = 'en',
      autoDetectLanguage = true,
    } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { ok: false, error: 'Agent name is required' },
        { status: 400 }
      )
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.aIAgentProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      })
    }

    // Convert arrays to JSON strings
    const trainingDocIdsJson = trainingDocumentIds && Array.isArray(trainingDocumentIds)
      ? JSON.stringify(trainingDocumentIds)
      : null
    const allowedPhrasesJson = allowedPhrases && Array.isArray(allowedPhrases)
      ? JSON.stringify(allowedPhrases)
      : allowedPhrases && typeof allowedPhrases === 'string' && allowedPhrases.trim()
        ? JSON.stringify(allowedPhrases.split('\n').filter(p => p.trim()))
        : null
    const prohibitedPhrasesJson = prohibitedPhrases && Array.isArray(prohibitedPhrases)
      ? JSON.stringify(prohibitedPhrases)
      : prohibitedPhrases && typeof prohibitedPhrases === 'string' && prohibitedPhrases.trim()
        ? JSON.stringify(prohibitedPhrases.split('\n').filter(p => p.trim()))
        : null
    const escalateRulesJson = escalateToHumanRules && Array.isArray(escalateToHumanRules)
      ? JSON.stringify(escalateToHumanRules)
      : escalateToHumanRules && typeof escalateToHumanRules === 'string' && escalateToHumanRules.trim()
        ? JSON.stringify(escalateToHumanRules.split('\n').filter(p => p.trim()))
        : null
    const skipRulesJson = skipAutoReplyRules && Array.isArray(skipAutoReplyRules)
      ? JSON.stringify(skipAutoReplyRules)
      : skipAutoReplyRules && typeof skipAutoReplyRules === 'string' && skipAutoReplyRules.trim()
        ? JSON.stringify(skipAutoReplyRules.split('\n').filter(p => p.trim()))
        : null

    const agent = await prisma.aIAgentProfile.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        isActive,
        isDefault,
        trainingDocumentIds: trainingDocIdsJson,
        systemPrompt: systemPrompt?.trim() || null,
        tone,
        maxMessageLength,
        maxTotalLength,
        maxQuestionsPerMessage,
        allowedPhrases: allowedPhrasesJson,
        prohibitedPhrases: prohibitedPhrasesJson,
        customGreeting: customGreeting?.trim() || null,
        customSignoff: customSignoff?.trim() || null,
        responseDelayMin,
        responseDelayMax,
        rateLimitMinutes,
        businessHoursStart,
        businessHoursEnd,
        timezone,
        allowOutsideHours,
        firstMessageImmediate,
        similarityThreshold,
        confidenceThreshold,
        escalateToHumanRules: escalateRulesJson,
        skipAutoReplyRules: skipRulesJson,
        defaultLanguage,
        autoDetectLanguage,
      },
    })

    return NextResponse.json({
      ok: true,
      agent,
    })
  } catch (error: any) {
    console.error('POST /api/admin/ai-training/agents error:', error)
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { ok: false, error: 'An agent with this name already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to create agent' },
      { status: 500 }
    )
  }
}


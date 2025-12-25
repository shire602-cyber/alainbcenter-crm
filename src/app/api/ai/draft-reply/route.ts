import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { buildConversationContext } from '@/lib/ai/context'
import { generateDraftReply } from '@/lib/ai/generate'
import { detectLanguage } from '@/lib/utils/languageDetection'

// POST /api/ai/draft-reply
// Input: leadId or conversationId, objective (qualify|renewal|followup|pricing|docs_request)
// Output: draftText, tone, language, nextQuestions array
export async function POST(req: NextRequest) {
  try {
    // Allow automation calls with CRON_SECRET, otherwise require auth
    const cronSecret = req.headers.get('x-cron-secret')
    const expectedSecret = process.env.CRON_SECRET
    let user = null
    
    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      // Automation call - use admin user as fallback
      user = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      })
      if (!user) {
        return NextResponse.json(
          { error: 'No admin user found for automation' },
          { status: 500 }
        )
      }
    } else {
      // Regular API call - require authentication
      user = await requireAuthApi()
    }
    
    const body = await req.json()

    const { leadId, conversationId, objective = 'followup' } = body

    // Validate input
    if (!leadId && !conversationId) {
      return NextResponse.json(
        { error: 'Either leadId or conversationId is required' },
        { status: 400 }
      )
    }

    const validObjectives = ['qualify', 'renewal', 'followup', 'pricing', 'docs_request', 'remind', 'book_call']
    if (!validObjectives.includes(objective)) {
      return NextResponse.json(
        { error: `objective must be one of: ${validObjectives.join(', ')}` },
        { status: 400 }
      )
    }

    let resolvedConversationId: number | null = null
    let resolvedLeadId: number | null = null
    let resolvedContactId: number | null = null
    let conversation: any = null
    let lead: any = null

    // Resolve IDs
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: parseInt(conversationId) },
        include: {
          contact: true,
          lead: {
            select: {
              id: true,
              stage: true,
              pipelineStage: true,
              leadType: true,
              serviceTypeId: true,
              priority: true,
              aiScore: true,
              aiNotes: true,
              nextFollowUpAt: true,
              lastContactAt: true,
              expiryDate: true,
              // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
            },
          }
        }
      })
      
      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        )
      }
      
      resolvedConversationId = conversation.id
      resolvedContactId = conversation.contactId
      resolvedLeadId = conversation.leadId
    } else if (leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: parseInt(leadId) },
        include: {
          contact: true,
          conversations: {
            orderBy: { lastMessageAt: 'desc' },
            take: 1
          }
        }
      })
      
      if (!lead) {
        return NextResponse.json(
          { error: 'Lead not found' },
          { status: 404 }
        )
      }
      
      resolvedLeadId = lead.id
      resolvedContactId = lead.contactId
      resolvedConversationId = lead.conversations[0]?.id || null
    }

    // Build context (use conversation if available, otherwise build from lead)
    let contextSummary: any
    if (resolvedConversationId) {
      contextSummary = await buildConversationContext(resolvedConversationId)
    } else {
      // Build context from lead data
      const contact = await prisma.contact.findUnique({
        where: { id: resolvedContactId! },
        include: {
          leads: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          expiryItems: {
            orderBy: { expiryDate: 'asc' },
            take: 5
          }
        }
      })
      
      contextSummary = {
        structured: {
          contact: {
            name: contact?.fullName,
            phone: contact?.phone,
            email: contact?.email,
            nationality: contact?.nationality
          },
          lead: lead ? {
            id: lead.id,
            stage: lead.stage || lead.pipelineStage,
            priority: lead.priority,
            serviceType: lead.serviceTypeEnum || lead.serviceType?.name,
            notes: lead.notes,
            aiScore: lead.aiScore,
            aiNotes: lead.aiNotes,
            nextFollowUpAt: lead.nextFollowUpAt,
            lastContactAt: lead.lastContactAt
          } : null,
          expiries: contact?.expiryItems || []
        },
        text: `Contact: ${contact?.fullName} (${contact?.phone}). Lead: ${lead?.stage || 'N/A'}. Notes: ${lead?.notes || 'None'}`
      }
    }

    // RETRIEVER-FIRST CHAIN: Check if AI can respond to this query
    // Get the user's query from recent messages
    // Check for both 'INBOUND' and 'inbound' for backward compatibility with existing data
    let userQuery = ''
    if (resolvedConversationId) {
      const lastMessage = await prisma.message.findFirst({
        where: { 
          conversationId: resolvedConversationId,
          OR: [
            { direction: 'INBOUND' },
            { direction: 'inbound' },
            { direction: 'IN' }, // Legacy support
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      })
      userQuery = lastMessage?.body || ''
    }
    if (!userQuery) {
      userQuery = contextSummary.structured.lead?.notes || contextSummary.text || ''
    }

    // Use retriever-first chain to check if we can respond
    const { retrieveAndGuard, markLeadRequiresHuman } = await import('@/lib/ai/retrieverChain')
    const retrievalResult = await retrieveAndGuard(userQuery, {
      similarityThreshold: parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7'),
      topK: 5,
    })

    // If AI cannot respond, mark lead and return polite message
    if (!retrievalResult.canRespond) {
      if (resolvedLeadId) {
        await markLeadRequiresHuman(resolvedLeadId, retrievalResult.reason, userQuery)
      }

      return NextResponse.json({
        error: retrievalResult.reason,
        requiresTraining: true,
        requiresHuman: true,
        suggestedResponse: retrievalResult.suggestedResponse || "I'm only trained to assist with specific business topics. Let me get a human agent for you.",
      }, { status: 400 })
    }

    // Determine tone and language based on objective
    let tone = 'professional'
    if (objective === 'followup' || objective === 'qualify') {
      tone = 'friendly'
    }

    // Build training context from retrieved documents
    const relevantTraining = retrievalResult.relevantDocuments
      .map(doc => `${doc.title} (${doc.type}, similarity: ${doc.similarity.toFixed(2)}):\n${doc.content}`)
      .join('\n\n---\n\n')

    // ALWAYS use AI-generated replies (no templates)
    const { generateDraftReply, generateModeSpecificDraft } = await import('@/lib/ai/generate')
    
    // Determine tone and mode based on objective
    let tone: 'professional' | 'friendly' | 'short' = 'friendly'
    let mode: 'FOLLOW_UP' | 'RENEWAL' | 'DOCS' | 'PRICING' | undefined = undefined
    
    if (objective === 'renewal' || objective === 'remind') {
      tone = 'professional'
      mode = 'RENEWAL'
    } else if (objective === 'pricing') {
      tone = 'professional'
      mode = 'PRICING'
    } else if (objective === 'docs_request') {
      tone = 'professional'
      mode = 'DOCS'
    } else if (objective === 'followup' || objective === 'qualify') {
      tone = 'friendly'
      mode = 'FOLLOW_UP'
    }
    
    // Detect language from messages
    const lastMessages = contextSummary.structured.messages.slice(-3)
    const messageText = lastMessages.map(m => m.message).join(' ')
    const detectedLanguage = detectLanguage(messageText || '')
    
    let draftText = ''
    let nextQuestions: string[] = []
    
    try {
      // ALWAYS use AI-generated replies
      // Use mode-specific AI generation if mode is specified, otherwise use general draft
      if (mode && (mode === 'RENEWAL' || mode === 'PRICING' || mode === 'DOCS')) {
        // Use the mode-specific generator for specialized modes
        const modeResult = await generateModeSpecificDraft(
          contextSummary.structured,
          mode,
          tone,
          detectedLanguage as 'en' | 'ar'
        )
        draftText = modeResult.text
      } else {
        // Use general AI draft generator (works for all objectives including qualify, followup, etc.)
        const aiResult = await generateDraftReply(
          contextSummary.structured,
          tone,
          detectedLanguage as 'en' | 'ar'
        )
        draftText = aiResult.text
      }
      
      // Extract questions from AI-generated text (simple heuristic)
      const questionMatches = draftText.match(/\d+[\.\)]\s*([^?\n]+[?])/g)
      if (questionMatches) {
        nextQuestions = questionMatches.map(q => q.replace(/^\d+[\.\)]\s*/, '').trim())
      } else {
        // Fallback: extract questions ending with ?
        const questions = draftText.match(/[^.!?\n]+[?]/g)
        if (questions) {
          nextQuestions = questions.slice(0, 3).map(q => q.trim())
        }
      }
      
      console.log(`✅ AI-generated draft for objective ${objective}: "${draftText.substring(0, 100)}..."`)
    } catch (aiError: any) {
      console.error('AI generation failed, using fallback:', aiError.message)
      // Fallback to simple message if AI fails
      const contactName = contextSummary.structured.contact?.name || 'there'
      draftText = `Hi ${contactName}, thank you for contacting Al Ain Business Center. How can I assist you today?`
      nextQuestions = ['How can I assist you today?']
    }

    // Language already detected above
    const language = detectedLanguage || 'en'

    // Ensure we have a conversationId (required by schema)
    // If we don't have one, create a conversation first
    let finalConversationId = resolvedConversationId
    if (!finalConversationId && resolvedLeadId && resolvedContactId) {
      // Create a conversation if we don't have one
      const newConversation = await prisma.conversation.create({
        data: {
          contactId: resolvedContactId,
          leadId: resolvedLeadId,
          channel: 'whatsapp', // Default channel
        },
      })
      finalConversationId = newConversation.id
    }

    if (!finalConversationId) {
      return NextResponse.json(
        { error: 'Unable to create draft: conversation or lead required' },
        { status: 400 }
      )
    }

    // Save draft
    const draft = await prisma.aIDraft.create({
      data: {
        conversationId: finalConversationId,
        leadId: resolvedLeadId ?? undefined,
        contactId: resolvedContactId ?? undefined,
        tone,
        language,
        promptVersion: 'v1',
        inputSummary: contextSummary.text.substring(0, 500),
        draftText,
        createdByUserId: user.id,
      },
    })

    // Log action
    await prisma.aIActionLog.create({
      data: {
        kind: 'draft_reply',
        conversationId: finalConversationId,
        leadId: resolvedLeadId ?? undefined,
        contactId: resolvedContactId ?? undefined,
        ok: true,
        meta: JSON.stringify({
          objective,
          tone,
          language,
          model: 'template-v1', // Can be upgraded to OpenAI later
        }),
      },
    })

    return NextResponse.json({
      draftText,
      tone,
      language,
      nextQuestions,
      draftId: draft.id
    })
  } catch (error: any) {
    console.error('POST /api/ai/draft-reply error:', error)

    // Log failed action
    try {
      const body = await req.json().catch(() => ({}))
      await prisma.aIActionLog.create({
        data: {
          kind: 'draft_reply',
          conversationId: body.conversationId || 0,
          ok: false,
          error: error.message || 'Unknown error',
        },
      })
    } catch (logError) {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate draft reply' },
      { status: 500 }
    )
  }
}





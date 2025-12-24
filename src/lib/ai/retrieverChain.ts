/**
 * Retriever-First Chain for Guarded Subject AI
 * 
 * Implements the "Retriever-First" pattern where AI only responds
 * if relevant training exists in the vector store.
 */

import { searchTrainingDocuments } from './vectorStore'
import { prisma } from '../prisma'

export interface RetrievalResult {
  canRespond: boolean
  reason: string
  relevantDocuments: Array<{
    title: string
    content: string
    type: string
    similarity: number
  }>
  requiresHuman: boolean
  suggestedResponse?: string
}

/**
 * Retriever-First Chain: Check if AI can respond to this query
 * 
 * @param query - The user's message/question
 * @param options - Configuration options
 * @returns RetrievalResult indicating if AI can respond
 */
export async function retrieveAndGuard(
  query: string,
  options: {
    similarityThreshold?: number
    topK?: number
    subjectTags?: string[] // Optional: specific subjects to match
  } = {}
): Promise<RetrievalResult> {
  const {
    similarityThreshold = 0.7, // Default threshold
    topK = 5,
    subjectTags = [],
  } = options

  try {
    // Step 1: Search vector store for relevant training
    const searchResults = await searchTrainingDocuments(query, {
      topK,
      similarityThreshold,
    })

    // Step 2: Check if we have relevant training
    // Check both documents and scores arrays to handle cases where filtering by type results in empty arrays
    if (!searchResults.hasRelevantTraining || searchResults.documents.length === 0 || searchResults.scores.length === 0) {
      return {
        canRespond: false,
        reason: 'No relevant training found for this topic. The AI has not been trained on this subject.',
        relevantDocuments: [],
        requiresHuman: true,
        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
      }
    }

    // Step 3: Check subject tags if specified
    if (subjectTags.length > 0) {
      const matchedSubjects = searchResults.documents.some(doc =>
        subjectTags.some(tag =>
          doc.metadata.title.toLowerCase().includes(tag.toLowerCase()) ||
          doc.content.toLowerCase().includes(tag.toLowerCase())
        )
      )

      if (!matchedSubjects) {
        return {
          canRespond: false,
          reason: `Query does not match required subject tags: ${subjectTags.join(', ')}`,
          relevantDocuments: [],
          requiresHuman: true,
          suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
        }
      }
    }

    // Step 4: Check similarity scores
    // Ensure scores array is not empty before calling Math.max (prevents -Infinity issue)
    if (searchResults.scores.length === 0) {
      return {
        canRespond: false,
        reason: 'No similarity scores available for retrieved documents.',
        relevantDocuments: [],
        requiresHuman: true,
        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
      }
    }
    
    const maxScore = Math.max(...searchResults.scores)
    if (maxScore < similarityThreshold) {
      return {
        canRespond: false,
        reason: `Highest similarity score (${maxScore.toFixed(2)}) is below threshold (${similarityThreshold})`,
        relevantDocuments: [],
        requiresHuman: true,
        suggestedResponse: "I'm only trained to assist with specific business topics. Let me get a human agent for you who can help with your question.",
      }
    }

    // Step 5: AI can respond - return relevant context
    // Ensure documents and scores arrays are aligned
    const minLength = Math.min(searchResults.documents.length, searchResults.scores.length)
    return {
      canRespond: true,
      reason: `Found ${minLength} relevant training document(s) with similarity >= ${similarityThreshold}`,
      relevantDocuments: searchResults.documents.slice(0, minLength).map((doc, idx) => ({
        title: doc.metadata.title || 'Untitled',
        content: (doc.content || '').substring(0, 1000), // Limit content length
        type: doc.metadata.type || 'unknown',
        similarity: searchResults.scores[idx] || 0,
      })),
      requiresHuman: false,
    }
  } catch (error: any) {
    console.error('Retriever chain error:', error)
    
    // On error, default to requiring human (fail-safe)
    return {
      canRespond: false,
      reason: `Error during retrieval: ${error.message}`,
      relevantDocuments: [],
      requiresHuman: true,
      suggestedResponse: "I'm experiencing a technical issue. Let me get a human agent for you.",
    }
  }
}

/**
 * Mark lead as requiring human intervention
 */
export async function markLeadRequiresHuman(
  leadId: number,
  reason: string,
  query?: string
): Promise<void> {
  try {
    // Update lead notes
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { notes: true },
    })

    const updatedNotes = lead?.notes
      ? `${lead.notes}\n\n[System - ${new Date().toISOString()}]: Requires Human Intervention - ${reason}${query ? `\nQuery: "${query}"` : ''}`
      : `[System - ${new Date().toISOString()}]: Requires Human Intervention - ${reason}${query ? `\nQuery: "${query}"` : ''}`

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        notes: updatedNotes,
        priority: 'HIGH', // Escalate priority
      },
    })

    // Create agent task if task system exists
    try {
      const { createAgentTask } = await import('../automation/agentFallback')
      // Use 'complex_query' as fallback since 'out_of_training' may not be a valid task type
      await createAgentTask(leadId, 'complex_query', {
        messageText: query || 'Unknown',
        confidence: 0, // No confidence since query is out of training
      })
    } catch (taskError) {
      // Task system might not be available, continue
      console.warn('Failed to create agent task:', taskError)
    }

    console.log(`⚠️ Lead ${leadId} marked as requiring human intervention: ${reason}`)
  } catch (error: any) {
    console.error('Failed to mark lead as requiring human:', error)
    // Don't throw - this is a non-critical operation
  }
}


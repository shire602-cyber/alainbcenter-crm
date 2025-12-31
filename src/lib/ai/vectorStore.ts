/**
 * Vector Store for AI Training Documents
 * 
 * Implements OpenAI embeddings with in-memory vector store for similarity search
 * Production: Replace with Pinecone, Weaviate, or Qdrant
 */

import { prisma } from '../prisma'

interface VectorDocument {
  id: string
  content: string
  metadata: {
    title: string
    type: string
    documentId: number
    createdAt: string
    language?: string | null // CRITICAL FIX E: Language tag
    stage?: string | null // CRITICAL FIX E: Stage tag
    serviceKey?: string | null // CRITICAL FIX E: Service key
    serviceTypeId?: number | null // CRITICAL FIX E: Service type ID
  }
  embedding?: number[]
}

class InMemoryVectorStore {
  private documents: Map<string, VectorDocument> = new Map()
  private embeddings: Map<string, number[]> = new Map()

  async addDocument(doc: VectorDocument, embedding: number[]) {
    this.documents.set(doc.id, doc)
    this.embeddings.set(doc.id, embedding)
  }

  async search(
    queryEmbedding: number[], 
    topK: number = 5, 
    threshold: number = 0.7,
    allowedDocumentIds?: number[]
  ): Promise<{
    documents: VectorDocument[]
    scores: number[]
  }> {
    const results: Array<{ doc: VectorDocument; score: number }> = []

    for (const [id, docEmbedding] of this.embeddings.entries()) {
      const score = this.cosineSimilarity(queryEmbedding, docEmbedding)
      if (score >= threshold) {
        const doc = this.documents.get(id)
        if (doc) {
          // Filter by allowed document IDs if specified
          if (allowedDocumentIds && allowedDocumentIds.length > 0) {
            const docId = doc.metadata.documentId
            if (!allowedDocumentIds.includes(docId)) {
              continue // Skip this document
            }
          }
          results.push({ doc, score })
        }
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return {
      documents: results.slice(0, topK).map(r => r.doc),
      scores: results.slice(0, topK).map(r => r.score),
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  async removeDocument(id: string) {
    this.documents.delete(id)
    this.embeddings.delete(id)
  }

  async clear() {
    this.documents.clear()
    this.embeddings.clear()
  }
}

// Singleton instance
const vectorStore = new InMemoryVectorStore()

/**
 * Generate embedding using configured AI provider (OpenAI-compatible API)
 * Falls back to OpenAI if configured provider doesn't support embeddings
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  // Try to get configured AI provider first
  let apiKey: string | null = null
  let apiUrl: string = 'https://api.openai.com/v1/embeddings'
  let model: string = 'text-embedding-3-small'
  
  try {
    const { getAIConfig } = await import('./client')
    const config = await getAIConfig()
    
    if (config) {
      // DeepSeek and OpenAI use OpenAI-compatible API
      // Note: DeepSeek may not support embeddings yet, so we'll try and fallback
      if (config.provider === 'deepseek') {
        apiKey = config.apiKey
        apiUrl = 'https://api.deepseek.com/v1/embeddings'
        model = 'text-embedding-3-small' // Use OpenAI model name (DeepSeek may not have embeddings)
      } else if (config.provider === 'openai') {
        apiKey = config.apiKey
        apiUrl = 'https://api.openai.com/v1/embeddings'
        model = 'text-embedding-3-small'
      }
      // Groq and Anthropic don't have embeddings, will fallback to OpenAI
    }
  } catch (error) {
    console.warn('Failed to get AI config for embeddings, using OpenAI fallback:', error)
  }
  
  // Fallback to OpenAI if no provider configured or if provider doesn't support embeddings
  if (!apiKey) {
    apiKey = process.env.OPENAI_API_KEY || null
    if (!apiKey) {
      // Don't throw - return null to allow graceful degradation
      console.warn('⚠️ [EMBEDDINGS] No embedding provider configured. Vector search will return empty results. Set OPENAI_API_KEY or configure DeepSeek/OpenAI integration.')
      return null as any // Return null to signal no embedding available
    }
    apiUrl = 'https://api.openai.com/v1/embeddings'
    model = 'text-embedding-3-small'
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        input: text.substring(0, 8000), // Limit to 8000 chars
      }),
    })

    if (!response.ok) {
      // If DeepSeek doesn't support embeddings, fallback to OpenAI
      if (apiUrl.includes('deepseek.com') && response.status === 404) {
        console.warn('DeepSeek embeddings not supported, falling back to OpenAI')
        return generateEmbeddingWithOpenAI(text)
      }
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Embedding API error: ${error.error?.message || 'Failed to generate embedding'}`)
    }

    const data = await response.json()
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid embedding response: missing or empty data array')
    }
    return data.data[0].embedding
  } catch (error: any) {
    // If using DeepSeek and it fails, try OpenAI fallback
    if (apiUrl.includes('deepseek.com') && !error.message.includes('OPENAI_API_KEY')) {
      console.warn('DeepSeek embedding failed, falling back to OpenAI:', error.message)
      return generateEmbeddingWithOpenAI(text)
    }
    console.error('Embedding generation error:', error)
    throw error
  }
}

/**
 * Fallback to OpenAI for embeddings
 */
async function generateEmbeddingWithOpenAI(text: string): Promise<number[] | null> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    // Don't throw - return null to allow graceful degradation
    console.warn('⚠️ [EMBEDDINGS] OPENAI_API_KEY not configured for embeddings fallback. Vector search will return empty results.')
    return null
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.substring(0, 8000),
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`OpenAI embedding API error: ${error.error?.message || 'Failed to generate embedding'}`)
  }

  const data = await response.json()
  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    throw new Error('Invalid embedding response: missing or empty data array')
  }
  return data.data[0].embedding
}

/**
 * Index a training document in the vector store
 */
export async function indexTrainingDocument(documentId: number): Promise<void> {
  try {
    const document = await prisma.aITrainingDocument.findUnique({
      where: { id: documentId },
    })

    if (!document) {
      throw new Error(`Document ${documentId} not found`)
    }

    // Generate embedding
    const embedding = await generateEmbedding(document.content)
    
    // If embedding generation failed (no API key), skip indexing
    if (!embedding) {
      console.warn(`⚠️ [VECTOR-STORE] Cannot index document ${documentId} - no API key configured. Skipping vector indexing.`)
      return // Skip indexing but don't throw error
    }

    // CRITICAL FIX E: Store in vector store with language/stage/serviceKey metadata
    await vectorStore.addDocument(
      {
        id: `doc_${documentId}`,
        content: document.content,
        metadata: {
          title: document.title,
          type: document.type,
          documentId: document.id,
          createdAt: document.createdAt.toISOString(),
          language: document.language || null, // CRITICAL FIX E: Store language tag
          stage: document.stage || null, // CRITICAL FIX E: Store stage tag
          serviceKey: document.serviceKey || null, // CRITICAL FIX E: Store serviceKey
          serviceTypeId: document.serviceTypeId || null, // CRITICAL FIX E: Store serviceTypeId
        },
      },
      embedding
    )

    console.log(`✅ Indexed training document: ${document.title}`)
  } catch (error: any) {
    console.error(`Failed to index document ${documentId}:`, error.message)
    throw error
  }
}

/**
 * Search for relevant training documents using vector similarity
 */
export async function searchTrainingDocuments(
  query: string,
  options: {
    topK?: number
    similarityThreshold?: number
    type?: string
    trainingDocumentIds?: number[]
    language?: string | null // CRITICAL FIX E: Filter by language
    stage?: string | null // CRITICAL FIX E: Filter by stage
    serviceKey?: string | null // CRITICAL FIX E: Filter by serviceKey
  } = {}
): Promise<{
  documents: VectorDocument[]
  scores: number[]
  hasRelevantTraining: boolean
}> {
  const { topK = 5, similarityThreshold = 0.7, type, trainingDocumentIds, language, stage, serviceKey } = options

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)
    
    // If embedding generation failed (no API key), return empty results
    if (!queryEmbedding) {
      console.warn('⚠️ [VECTOR-SEARCH] Cannot generate embedding - no API key configured. Returning empty results.')
      return {
        documents: [],
        scores: [],
        hasRelevantTraining: false,
      }
    }

    // CRITICAL FIX E: Search vector store with language/stage/serviceKey filters
    const results = await vectorStore.search(
      queryEmbedding, 
      topK, 
      similarityThreshold, 
      trainingDocumentIds,
      language,
      stage,
      serviceKey
    )

    // Filter by type if specified
    let filteredDocs = results.documents
    let filteredScores = results.scores
    
    if (type) {
      // Filter both documents and scores together to maintain alignment
      const filtered = results.documents
        .map((doc, idx) => ({ doc, score: results.scores[idx] }))
        .filter(({ doc }) => doc.metadata.type === type)
      
      filteredDocs = filtered.map(({ doc }) => doc)
      filteredScores = filtered.map(({ score }) => score)
    }

    return {
      documents: filteredDocs,
      scores: filteredScores,
      hasRelevantTraining: filteredDocs.length > 0,
    }
  } catch (error: any) {
    console.error('Vector search error:', error)
    // Fallback: return empty results
    return {
      documents: [],
      scores: [],
      hasRelevantTraining: false,
    }
  }
}

/**
 * Re-index all training documents (useful after bulk updates)
 */
export async function reindexAllTrainingDocuments(): Promise<void> {
  try {
    const documents = await prisma.aITrainingDocument.findMany({
      orderBy: { createdAt: 'desc' },
    })

    console.log(`🔄 Re-indexing ${documents.length} training documents...`)

    // Clear existing index
    await vectorStore.clear()

    // Index each document
    for (const doc of documents) {
      try {
        await indexTrainingDocument(doc.id)
      } catch (error: any) {
        console.error(`Failed to index document ${doc.id}:`, error.message)
        // Continue with other documents
      }
    }

    console.log(`✅ Re-indexing complete`)
  } catch (error: any) {
    console.error('Re-indexing error:', error)
    throw error
  }
}

/**
 * Remove document from vector store
 */
export async function removeTrainingDocument(documentId: number): Promise<void> {
  await vectorStore.removeDocument(`doc_${documentId}`)
}


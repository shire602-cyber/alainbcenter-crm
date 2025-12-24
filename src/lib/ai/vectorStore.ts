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

  async search(queryEmbedding: number[], topK: number = 5, threshold: number = 0.7): Promise<{
    documents: VectorDocument[]
    scores: number[]
  }> {
    const results: Array<{ doc: VectorDocument; score: number }> = []

    for (const [id, docEmbedding] of this.embeddings.entries()) {
      const score = this.cosineSimilarity(queryEmbedding, docEmbedding)
      if (score >= threshold) {
        const doc = this.documents.get(id)
        if (doc) {
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
 * Generate embedding using OpenAI API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small', // Cost-effective, good quality
        input: text.substring(0, 8000), // Limit to 8000 chars
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`OpenAI API error: ${error.error?.message || 'Failed to generate embedding'}`)
    }

    const data = await response.json()
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error('Invalid embedding response: missing or empty data array')
    }
    return data.data[0].embedding
  } catch (error: any) {
    console.error('Embedding generation error:', error)
    throw error
  }
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

    // Store in vector store
    await vectorStore.addDocument(
      {
        id: `doc_${documentId}`,
        content: document.content,
        metadata: {
          title: document.title,
          type: document.type,
          documentId: document.id,
          createdAt: document.createdAt.toISOString(),
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
  } = {}
): Promise<{
  documents: VectorDocument[]
  scores: number[]
  hasRelevantTraining: boolean
}> {
  const { topK = 5, similarityThreshold = 0.7, type } = options

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query)

    // Search vector store
    const results = await vectorStore.search(queryEmbedding, topK, similarityThreshold)

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


# Guarded Subject AI - Modular Implementation

## Root Cause: Webhook Silence

### Analysis
The WhatsApp webhook **is receiving messages** but automation wasn't triggering because:

1. **No Rules Configured**: No active `INBOUND_MESSAGE` automation rules in database
2. **Condition Mismatches**: Rules exist but stage/channel conditions don't match
3. **Silent Failures**: Errors caught but not prominently logged
4. **Missing Training**: AI cannot respond without training documents (new requirement)

### Solution
- ✅ Enhanced logging throughout automation pipeline
- ✅ Fixed stage matching (checks both `stage` and `pipelineStage`)
- ✅ Implemented retriever-first chain (AI only responds if trained)
- ✅ Added error logging to database for monitoring

---

## Modular Code: Retriever-First Chain

### 1. Vector Store Module

**File**: `src/lib/ai/vectorStore.ts`

```typescript
/**
 * Vector Store for AI Training Documents
 * Uses OpenAI embeddings with in-memory vector store
 * Production: Replace with Pinecone, Weaviate, or Qdrant
 */

// Key Functions:
- indexTrainingDocument(documentId)     // Index on upload
- searchTrainingDocuments(query, options) // Semantic search
- reindexAllTrainingDocuments()         // Bulk re-index
```

**Usage**:
```typescript
import { indexTrainingDocument, searchTrainingDocuments } from '@/lib/ai/vectorStore'

// Index document after upload
await indexTrainingDocument(document.id)

// Search for relevant training
const results = await searchTrainingDocuments(userQuery, {
  topK: 5,
  similarityThreshold: 0.7,
})
```

### 2. Retriever Chain Module

**File**: `src/lib/ai/retrieverChain.ts`

```typescript
/**
 * Retriever-First Chain: Check if AI can respond
 * 
 * Flow:
 * 1. Generate query embedding
 * 2. Search vector store
 * 3. Check similarity scores
 * 4. Return: canRespond, relevantDocuments, requiresHuman
 */

// Key Functions:
- retrieveAndGuard(query, options)       // Main retrieval logic
- markLeadRequiresHuman(leadId, reason) // Escalation handler
```

**Usage**:
```typescript
import { retrieveAndGuard } from '@/lib/ai/retrieverChain'

const result = await retrieveAndGuard(userQuery, {
  similarityThreshold: 0.7,
  topK: 5,
})

if (!result.canRespond) {
  // Mark lead + send polite message
  await markLeadRequiresHuman(leadId, result.reason, userQuery)
  return result.suggestedResponse
}

// Use result.relevantDocuments for AI context
```

### 3. Queue System Module

**File**: `src/lib/queue/automationQueue.ts`

```typescript
/**
 * Automation Queue System
 * Uses BullMQ (Redis) or in-memory fallback
 */

// Key Functions:
- enqueueAutomation(type, data, options) // Queue job
- initializeQueue()                      // Setup queue
```

**Usage**:
```typescript
import { enqueueAutomation } from '@/lib/queue/automationQueue'

// Queue automation job
const jobId = await enqueueAutomation('autopilot_run', {
  dryRun: false,
  userId: user.id,
}, {
  priority: 10,
  delay: 0,
})
```

### 4. Adaptive Scheduling Module

**File**: `src/lib/automation/adaptiveScheduling.ts`

```typescript
/**
 * Adaptive Scheduling Intelligence
 * Analyzes engagement and suggests optimal follow-up
 */

// Key Functions:
- analyzeAndRecommendFollowUp(leadId)   // Get recommendation
- scheduleFollowUp(leadId, time, type)   // Two-tier scheduling
```

**Usage**:
```typescript
import { analyzeAndRecommendFollowUp, scheduleFollowUp } from '@/lib/automation/adaptiveScheduling'

const recommendation = await analyzeAndRecommendFollowUp(leadId)
await scheduleFollowUp(
  leadId,
  recommendation.recommendedTime,
  'followup'
)
```

---

## Integration Points

### 1. AI Draft Reply Endpoint

**File**: `src/app/api/ai/draft-reply/route.ts`

**Integration**:
```typescript
// Before generating reply, check training
const retrievalResult = await retrieveAndGuard(userQuery, {
  similarityThreshold: parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7'),
  topK: 5,
})

if (!retrievalResult.canRespond) {
  await markLeadRequiresHuman(resolvedLeadId, retrievalResult.reason, userQuery)
  return NextResponse.json({
    error: retrievalResult.reason,
    requiresHuman: true,
    suggestedResponse: retrievalResult.suggestedResponse,
  }, { status: 400 })
}
```

### 2. Automation Actions

**File**: `src/lib/automation/actions.ts`

**Integration**:
```typescript
// In executeSendAIReply()
if (userQuery) {
  const retrievalResult = await retrieveAndGuard(userQuery, {
    similarityThreshold: 0.7,
    topK: 5,
  })

  if (!retrievalResult.canRespond) {
    await markLeadRequiresHuman(lead.id, retrievalResult.reason, userQuery)
    // Send polite message and return
  }
}
```

### 3. Run Now Automation

**File**: `src/app/api/autopilot/run/route.ts`

**Integration**:
```typescript
// Queue job instead of running synchronously
const { enqueueAutomation } = await import('@/lib/queue/automationQueue')
const jobId = await enqueueAutomation('autopilot_run', { dryRun, userId }, {
  priority: 10,
})

return NextResponse.json({
  ok: true,
  jobId,
  status: 'queued',
})
```

---

## Environment Variables

### Required
```bash
OPENAI_API_KEY=sk-...                    # For embeddings
AI_SIMILARITY_THRESHOLD=0.7              # Similarity threshold (0.0-1.0)
```

### Optional (Recommended)
```bash
REDIS_URL=redis://localhost:6379        # For queue system
```

### Webhook Security
```bash
WHATSAPP_VERIFY_TOKEN=your_token
WHATSAPP_APP_SECRET=your_secret
```

---

## Testing Protocol

### 1. Test Vector Store
```typescript
// Upload training document
POST /api/admin/ai-training/upload

// Re-index
POST /api/admin/ai-training/reindex

// Test search
import { searchTrainingDocuments } from '@/lib/ai/vectorStore'
const results = await searchTrainingDocuments('business setup', { topK: 5 })
console.log(results)
```

### 2. Test Retriever Chain
```typescript
import { retrieveAndGuard } from '@/lib/ai/retrieverChain'

// Test with trained topic
const result1 = await retrieveAndGuard('I need help with business setup')
console.log(result1.canRespond) // Should be true

// Test with untrained topic
const result2 = await retrieveAndGuard('What is the weather today?')
console.log(result2.canRespond) // Should be false
console.log(result2.requiresHuman) // Should be true
```

### 3. Test Queue System
```typescript
import { enqueueAutomation } from '@/lib/queue/automationQueue'

const jobId = await enqueueAutomation('autopilot_run', { dryRun: true })
console.log('Job queued:', jobId)
```

### 4. Test Webhook
```bash
# Send test WhatsApp message
# Check server logs for:
# - "📥 WhatsApp webhook POST received"
# - "🔍 Found X active INBOUND_MESSAGE rule(s)"
# - "🔄 Running automation rule..."
# - "✅ Automation rule executed successfully"
```

---

## Production Deployment Checklist

- [ ] Install dependencies: `npm install bullmq ioredis pdf-parse`
- [ ] Set `OPENAI_API_KEY` in environment
- [ ] Set `AI_SIMILARITY_THRESHOLD` (default: 0.7)
- [ ] Set `REDIS_URL` (optional but recommended)
- [ ] Upload training documents via `/admin/ai-training`
- [ ] Re-index documents: `POST /api/admin/ai-training/reindex`
- [ ] Test with trained topic → Should respond
- [ ] Test with untrained topic → Should handoff to human
- [ ] Verify "Run Now" queues jobs correctly
- [ ] Monitor logs for automation execution

---

## Performance Optimization

1. **Vector Store**: Upgrade to Pinecone/Weaviate for production scale
2. **Embedding Caching**: Cache embeddings for frequently accessed documents
3. **Batch Processing**: Process multiple documents in parallel
4. **Redis Persistence**: Configure Redis persistence for job durability

---

**Status**: ✅ Complete - All modules implemented and integrated


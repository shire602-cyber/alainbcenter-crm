# Dual-LLM Routing System

## Overview

This system implements intelligent routing between two LLM providers:
- **Primary (Cheap)**: Llama 3.1 70B via Groq - for standard tasks
- **Escalation (Premium)**: OpenAI GPT-4o - for high-complexity requests

The routing service automatically detects prompt complexity and routes to the appropriate LLM, with automatic fallback if the primary LLM fails or returns low confidence.

## Architecture

```
Application Code
    ↓
generateCompletion() (Abstraction Layer)
    ↓
RoutingService
    ├─→ Complexity Analysis
    ├─→ Route Decision (Llama 3 vs GPT-4o)
    ├─→ Execute Request
    ├─→ Check Confidence
    └─→ Fallback to GPT-4o if needed
    ↓
Usage Logger (Cost Tracking)
```

## Key Components

### 1. LLM Provider Abstraction (`src/lib/llm/types.ts`)

Defines the interface that all LLM providers must implement:

```typescript
interface LLMProvider {
  name: string
  model: string
  costPer1KInput: number
  costPer1KOutput: number
  complete(messages, options): Promise<LLMCompletionResult>
  isAvailable(): Promise<boolean>
}
```

### 2. Llama 3 Provider (`src/lib/llm/providers/llama3.ts`)

- Uses Groq API (free tier available)
- Model: `llama-3.1-70b-versatile`
- Cost: $0.00 per 1K tokens (free tier)
- Fast and cost-effective for standard tasks

### 3. OpenAI Provider (`src/lib/llm/providers/openai.ts`)

- Uses OpenAI API
- Model: `gpt-4o`
- Cost: $0.005/1K input, $0.015/1K output
- Premium quality for complex tasks

### 4. Complexity Detection (`src/lib/llm/complexity.ts`)

Analyzes prompts based on:
- **Length**: Long prompts (>2000 chars) = higher complexity
- **Questions**: Multiple questions (>3) = higher complexity
- **Reasoning Keywords**: "analyze", "compare", "evaluate" = high complexity
- **Technical Content**: Legal/compliance terms = high complexity
- **Multi-step Tasks**: Step-by-step instructions = higher complexity
- **Emotional/Sensitive**: Complaints, urgent requests = higher complexity
- **Context**: Long conversations, sensitive stages = higher complexity

**Complexity Levels**:
- **Low** (score < 30): Use Llama 3
- **Medium** (score 30-59): Use Llama 3 (unless score ≥ 50)
- **High** (score ≥ 60): Use GPT-4o

### 5. Routing Service (`src/lib/llm/routing.ts`)

Main routing logic:
1. Analyze prompt complexity
2. Route to Llama 3 (low/medium) or GPT-4o (high)
3. Check confidence score
4. Fallback to GPT-4o if:
   - Llama 3 fails
   - Confidence < 50%
   - Explicit escalation needed

### 6. Usage Logger (`src/lib/llm/usageLogger.ts`)

Tracks:
- Token usage (input, output, total)
- Cost per request
- Provider used
- Escalation reason
- Complexity level

## Usage

### Basic Usage

```typescript
import { generateCompletion } from '@/lib/llm'
import type { LLMMessage } from '@/lib/llm/types'

const messages: LLMMessage[] = [
  {
    role: 'system',
    content: 'You are a helpful assistant.',
  },
  {
    role: 'user',
    content: 'What services do you offer?',
  },
]

const result = await generateCompletion(messages, {
  temperature: 0.7,
  maxTokens: 500,
})

console.log(result.text)
console.log(result.confidence)
console.log(result.tokensUsed)
```

### With Context (for better routing)

```typescript
const result = await generateCompletion(messages, options, {
  leadStage: 'QUALIFIED',
  conversationLength: 15,
  hasMultipleQuestions: true,
  requiresReasoning: false,
})
```

### With Routing Decision Info

```typescript
import { generateCompletionWithDecision } from '@/lib/llm'

const { result, decision } = await generateCompletionWithDecision(messages, options)

console.log(`Provider: ${decision.provider}`)
console.log(`Reason: ${decision.reason}`)
console.log(`Complexity: ${decision.complexity}`)
console.log(`Escalated: ${decision.escalated}`)
```

## Environment Variables

### Required

```bash
# Groq API Key (for Llama 3)
GROQ_API_KEY=your_groq_api_key

# OpenAI API Key (for GPT-4o escalation)
OPENAI_API_KEY=sk-...
```

### Optional

```bash
# Or configure via database Integration settings
# - Integration name: 'groq' (for Llama 3)
# - Integration name: 'openai' (for GPT-4o)
```

## Cost Optimization

### Automatic Cost Savings

- **Simple prompts** → Llama 3 (free) = $0.00
- **Complex prompts** → GPT-4o = ~$0.01-0.05 per request
- **Fallback only when needed** → Minimizes GPT-4o usage

### Cost Tracking

All LLM usage is logged with:
- Provider used
- Tokens consumed
- Cost per request
- Escalation reason

View usage stats:
```typescript
import { getUsageStats } from '@/lib/llm/usageLogger'

const stats = await getUsageStats(startDate, endDate)
console.log(`Total Cost: $${stats.totalCost}`)
console.log(`Total Tokens: ${stats.totalTokens}`)
console.log(`By Provider:`, stats.byProvider)
```

## Fallback Mechanism

The system automatically falls back to GPT-4o if:

1. **Llama 3 fails**: API error, timeout, etc.
2. **Low confidence**: Llama 3 returns confidence < 50%
3. **Empty response**: Llama 3 returns empty text

Fallback is transparent - the application code doesn't need to handle it.

## Testing

Run unit tests:
```bash
npm test
```

Run tests with UI:
```bash
npm run test:ui
```

Run tests with coverage:
```bash
npm run test:coverage
```

## Integration with Existing Code

The routing service is already integrated into:
- `src/lib/ai/generate.ts` - Draft reply generation
- `src/app/api/ai/draft-reply/route.ts` - AI draft endpoint

Other AI endpoints can be updated to use:
```typescript
import { generateCompletion } from '@/lib/llm'
```

Instead of direct OpenAI calls.

## Example: Complexity Detection

### Low Complexity (→ Llama 3)
```
User: "What services do you offer?"
Score: 5
Factors: []
```

### Medium Complexity (→ Llama 3)
```
User: "What services do you offer? How much do they cost? What documents do I need?"
Score: 35
Factors: ['multiple_questions']
```

### High Complexity (→ GPT-4o)
```
User: "Please analyze and compare all business license options available in UAE. I need a detailed evaluation with compliance considerations and recommendations."
Score: 70
Factors: ['requires_reasoning', 'technical_content', 'long_prompt']
```

## Best Practices

1. **Always use the abstraction layer**: Don't call providers directly
2. **Provide context**: Helps with better routing decisions
3. **Monitor costs**: Check usage stats regularly
4. **Test complexity detection**: Verify prompts route correctly
5. **Handle errors gracefully**: The routing service handles fallbacks, but your code should still handle final failures

## Troubleshooting

### Llama 3 not available
- Check `GROQ_API_KEY` environment variable
- Or configure Groq integration in database
- System will fallback to GPT-4o automatically

### OpenAI not available
- Check `OPENAI_API_KEY` environment variable
- Or configure OpenAI integration in database
- System will fail if both providers unavailable

### High costs
- Check usage stats to see which prompts are escalating
- Review complexity detection - may need tuning
- Consider adjusting complexity thresholds

## Future Enhancements

- [ ] Add Ollama support for local Llama 3
- [ ] Fine-tune complexity detection based on actual usage
- [ ] Add caching for repeated prompts
- [ ] Add rate limiting per provider
- [ ] Add cost budgets and alerts
- [ ] Add provider health monitoring


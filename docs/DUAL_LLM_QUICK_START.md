# Dual-LLM Routing - Quick Start Guide

## Installation

1. **Install dependencies** (already in package.json):
```bash
npm install
```

2. **Set environment variables**:
```bash
# Required: Groq API Key (free tier available)
GROQ_API_KEY=your_groq_api_key_here

# Required: OpenAI API Key (for escalation)
OPENAI_API_KEY=sk-your_openai_key_here
```

## Get API Keys

### Groq (Llama 3) - Free Tier Available
1. Go to https://console.groq.com
2. Sign up (free)
3. Create API key
4. Copy to `GROQ_API_KEY`

### OpenAI (GPT-4o)
1. Go to https://platform.openai.com
2. Create API key
3. Copy to `OPENAI_API_KEY`

## Basic Usage

```typescript
import { generateCompletion } from '@/lib/llm'
import type { LLMMessage } from '@/lib/llm/types'

// Simple prompt (will use Llama 3)
const messages: LLMMessage[] = [
  { role: 'user', content: 'What services do you offer?' },
]

const result = await generateCompletion(messages)
console.log(result.text) // Response from Llama 3
```

## How It Works

1. **Simple prompts** → Automatically routed to Llama 3 (free)
2. **Complex prompts** → Automatically routed to GPT-4o (premium)
3. **If Llama 3 fails** → Automatically falls back to GPT-4o

You don't need to think about which LLM to use - the system decides automatically!

## Testing

```bash
# Run unit tests
npm test

# Run tests with UI
npm run test:ui
```

## Cost Tracking

View your LLM usage and costs:
```typescript
import { getUsageStats } from '@/lib/llm/usageLogger'

const stats = await getUsageStats()
console.log(`Total Cost: $${stats.totalCost.toFixed(4)}`)
console.log(`By Provider:`, stats.byProvider)
```

## Example: Simple vs Complex

### Simple (→ Llama 3, $0.00)
```typescript
const result = await generateCompletion([
  { role: 'user', content: 'Hello, what services do you offer?' },
])
```

### Complex (→ GPT-4o, ~$0.01)
```typescript
const result = await generateCompletion([
  {
    role: 'user',
    content: 'Please analyze and compare all business license options in UAE with detailed compliance considerations and recommendations.',
  },
])
```

## Integration

The routing is already integrated into:
- ✅ `src/lib/ai/generate.ts` - Draft reply generation
- ✅ `src/app/api/ai/draft-reply/route.ts` - AI draft endpoint

Other endpoints can use:
```typescript
import { generateCompletion } from '@/lib/llm'
```

## Troubleshooting

**"Groq API key not configured"**
→ Set `GROQ_API_KEY` environment variable

**"OpenAI API key not configured"**
→ Set `OPENAI_API_KEY` environment variable

**High costs?**
→ Check usage stats to see which prompts are escalating to GPT-4o

## Next Steps

1. Set API keys
2. Test with simple prompts (should use Llama 3)
3. Test with complex prompts (should use GPT-4o)
4. Monitor costs via usage stats
5. Adjust complexity thresholds if needed

For detailed documentation, see `docs/DUAL_LLM_ROUTING.md`.


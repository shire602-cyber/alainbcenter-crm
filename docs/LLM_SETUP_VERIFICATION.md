# LLM Setup Verification

## Quick Verification

Since the API keys are already in your system, verify the setup:

```bash
# When npm is available, run:
npx tsx scripts/verify-llm-setup.ts
```

This will check:
- ✅ Environment variables (`GROQ_API_KEY`, `OPENAI_API_KEY`)
- ✅ Database integrations (Groq and OpenAI)
- ✅ Provider availability

## How Keys Are Loaded

The system checks for API keys in this order:

1. **Environment Variables** (first priority)
   - `GROQ_API_KEY` → For Llama 3
   - `OPENAI_API_KEY` → For GPT-4o

2. **Database Integrations** (fallback)
   - Integration with `name: 'groq'` → For Llama 3
   - Integration with `name: 'openai'` → For GPT-4o

## Installation (When npm is available)

```bash
# Install dependencies
npm install

# This will install:
# - vitest (for testing)
# - @vitest/ui (test UI)
# - Other existing dependencies
```

## Testing the Routing

Once dependencies are installed:

```bash
# Run unit tests
npm test

# Or run with UI
npm run test:ui
```

## Manual Test

You can test the routing manually:

```typescript
import { generateCompletion } from '@/lib/llm'

// Simple prompt (should use Llama 3)
const result = await generateCompletion([
  { role: 'user', content: 'What services do you offer?' },
])
console.log('Provider used:', result.model)
console.log('Response:', result.text)
```

## Current Status

✅ **Code is ready** - The routing system is implemented and will automatically:
- Use Llama 3 for simple prompts (if Groq key available)
- Use GPT-4o for complex prompts (if OpenAI key available)
- Fallback to GPT-4o if Llama 3 fails

✅ **Keys are configured** - As you mentioned, the keys are already in the system

⏳ **Dependencies pending** - Install when npm is available:
```bash
npm install
```

## Next Steps

1. **Install dependencies** (when npm available):
   ```bash
   npm install
   ```

2. **Verify setup**:
   ```bash
   npx tsx scripts/verify-llm-setup.ts
   ```

3. **Test routing**:
   ```bash
   npm test
   ```

4. **Start using**:
   - The system is already integrated into `src/lib/ai/generate.ts`
   - All AI draft generation will automatically use intelligent routing

## Troubleshooting

**"Groq API key not configured"**
- Check `GROQ_API_KEY` environment variable
- Or check Groq integration in database (`/settings/integrations`)

**"OpenAI API key not configured"**
- Check `OPENAI_API_KEY` environment variable
- Or check OpenAI integration in database (`/settings/integrations`)

**Both providers available?**
- ✅ Simple prompts → Llama 3 (free)
- ✅ Complex prompts → GPT-4o (premium)
- ✅ Automatic fallback if Llama 3 fails


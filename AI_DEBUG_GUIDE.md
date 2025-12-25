# AI Generation Debug Guide

## Current Status
- ✅ AI is configured (Groq via database integration)
- ❌ AI generation is failing (falling back to generic messages)
- ✅ Error logging has been enhanced

## How to Debug

### 1. Check Vercel Logs
Go to your Vercel dashboard → Project → Deployments → Latest → Functions Logs

Look for these log patterns:
- `❌ [AI-GEN]` - AI generation errors
- `❌ [LLM-ROUTING]` - LLM routing/provider errors
- `⚠️ [AI-GEN]` - AI generation warnings
- `📝 [FALLBACK]` - Fallback usage

### 2. Check AI Configuration
Run locally:
```bash
npx tsx scripts/check-ai-config.ts
```

This will show:
- Which API keys are set
- Which integrations are configured
- Current AI provider being used

### 3. Common Issues

#### Issue: "AI not configured"
**Solution**: Set one of these in Vercel environment variables:
- `GROQ_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

Or configure in admin panel: `/settings/integrations/ai`

#### Issue: "All LLM providers failed"
**Possible causes**:
- Invalid API key
- Network connectivity issues
- API rate limits
- Model not available

**Solution**: Check Vercel logs for specific error message

#### Issue: "Empty response from AI"
**Possible causes**:
- API returned empty content
- Response parsing failed
- Model issue

**Solution**: Check API key validity and model availability

### 4. Test AI Generation Directly

Create a test script to verify AI works:
```typescript
// scripts/test-ai-generation.ts
import { generateCompletion } from '../src/lib/llm'

const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Say hello' }
]

const result = await generateCompletion(messages)
console.log('AI Response:', result.text)
```

### 5. Verify Database Integration

Check if Groq integration is properly configured:
```sql
SELECT name, "isEnabled", "apiKey" IS NOT NULL as has_key 
FROM "Integration" 
WHERE name IN ('groq', 'openai', 'anthropic');
```

## Next Steps

1. **Check Vercel logs** - This will show the exact error
2. **Verify API key** - Make sure the Groq API key in the database is valid
3. **Test API directly** - Use the test script to verify AI works
4. **Check network** - Ensure Vercel can reach Groq API

## Expected Logs When Working

When AI generation succeeds, you should see:
```
🤖 [AI-GEN] Calling generateAIAutoresponse with context: {...}
🔄 Trying llama3 (primary)
✅ [AI-GEN] AI generated fresh reply (150 chars): "..."
```

When AI generation fails, you should see:
```
❌ [AI-GEN] Error generating AI autoresponse: [error message]
❌ [LLM-ROUTING] llama3 failed: [error message]
📝 [FALLBACK] Using minimal fallback (AI generation failed)
```


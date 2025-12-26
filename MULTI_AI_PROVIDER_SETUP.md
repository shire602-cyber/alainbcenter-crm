# Multi-AI Provider Configuration

## Overview

The system now supports configuring multiple AI providers simultaneously, each with its own API key. This enables:
- **Primary Provider**: DeepSeek (recommended)
- **Fallback Providers**: OpenAI, Anthropic, Groq
- **Automatic Failover**: If primary fails, system automatically tries fallback providers in order

## How It Works

### 1. Separate Integrations
Each AI provider has its own integration entry in the database:
- `deepseek` - DeepSeek API
- `openai` - OpenAI API  
- `groq` - Groq API
- `anthropic` - Anthropic API

### 2. Configuration UI
Navigate to **Settings → AI Integration** to configure all providers:
- Each provider has its own card/section
- Each provider can have its own API key
- Each provider can be enabled/disabled independently
- Each provider can select its preferred model

### 3. Routing Logic
The routing service automatically:
1. Tries DeepSeek first (if enabled)
2. Falls back to OpenAI (if DeepSeek fails)
3. Falls back to Anthropic (if OpenAI fails)
4. Falls back to Groq (if Anthropic fails)

## Setup Instructions

### Step 1: Access AI Integration Settings
1. Go to **Settings → AI Integration** (or **Admin → Integrations → AI Models**)
2. You'll see separate cards for each provider

### Step 2: Configure DeepSeek (Primary)
1. In the **DeepSeek (Primary)** card:
   - Select model: `deepseek-chat` (recommended)
   - Enter your DeepSeek API key
   - Enable the provider
   - Click "Test Connection" to verify
   - Click "Save Settings"

### Step 3: Configure OpenAI (Fallback)
1. In the **OpenAI (Fallback)** card:
   - Select model: `gpt-4o-mini` (recommended) or `gpt-4o`
   - Enter your OpenAI API key
   - Enable the provider
   - Click "Test Connection" to verify
   - Click "Save Settings"

### Step 4: Configure Additional Providers (Optional)
- **Groq**: Fast and cheap, good for high-volume tasks
- **Anthropic**: Premium quality, good for complex reasoning

## Testing

Run the test script to verify configuration:
```bash
npx tsx scripts/test-multi-ai-providers.ts
```

This will show:
- Which providers are configured
- Which providers have API keys
- Which providers are enabled
- Provider availability status

## API Key Sources

Each provider checks for API keys in this order:
1. Database integration (configured in UI)
2. Environment variable (fallback):
   - `DEEPSEEK_API_KEY`
   - `OPENAI_API_KEY`
   - `GROQ_API_KEY`
   - `ANTHROPIC_API_KEY`

## Provider Details

### DeepSeek (Primary)
- **Models**: `deepseek-chat`, `deepseek-coder`
- **Cost**: $0.14/1M input, $0.28/1M output
- **Speed**: Fast
- **Quality**: Very High
- **Context**: 64K tokens

### OpenAI (Fallback)
- **Models**: `gpt-4o-mini`, `gpt-4o`
- **Cost**: $0.15-$2.50/1M input, $0.60-$10.00/1M output
- **Speed**: Fast to Medium
- **Quality**: High to Very High
- **Context**: 128K tokens

### Groq (Fast & Cheap)
- **Models**: `llama-3.1-8b-instant`, `mixtral-8x7b-32768`
- **Cost**: $0.05-$0.24/1M tokens
- **Speed**: Very Fast
- **Quality**: Medium to High
- **Context**: 8K-32K tokens

### Anthropic (Premium)
- **Models**: `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`
- **Cost**: $0.80-$3.00/1M input, $4.00-$15.00/1M output
- **Speed**: Fast to Medium
- **Quality**: High to Very High
- **Context**: 200K tokens

## Troubleshooting

### Provider Not Available
- Check if the integration is enabled in the UI
- Verify the API key is correct
- Test the connection using the "Test Connection" button
- Check environment variables if not using database integration

### All Providers Failing
- Ensure at least one provider is configured and enabled
- Check API key validity
- Verify network connectivity
- Check provider API status

### Routing Issues
- Check provider availability using the test script
- Verify DeepSeek is enabled (primary)
- Ensure at least one fallback provider is configured

## Files Changed

1. **`src/components/settings/MultiAIProviderSettings.tsx`** - New multi-provider UI component
2. **`src/app/settings/integrations/ai/page.tsx`** - Updated to use multi-provider component
3. **`src/lib/llm/providers/deepseek.ts`** - DeepSeek provider implementation
4. **`src/lib/llm/providers/openai.ts`** - Updated to read model from config
5. **`src/lib/llm/providers/anthropic.ts`** - Updated to read model from config
6. **`src/lib/llm/routing.ts`** - Updated routing to prioritize DeepSeek
7. **`src/app/admin/integrations/page.tsx`** - Updated to seed all AI provider integrations

## Migration Notes

- Existing configurations are preserved
- If you had OpenAI configured, it will continue to work
- New DeepSeek, Groq, and Anthropic integrations will be auto-created
- You can configure multiple providers without affecting existing ones


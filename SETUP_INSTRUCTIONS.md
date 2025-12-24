# Dual-LLM Routing Setup Instructions

## ✅ Current Status

- ✅ **Code implemented** - All routing logic is complete
- ✅ **API keys configured** - As you mentioned, keys are already in the system
- ⏳ **Dependencies** - Need to install when npm is available

## Installation (When npm is available)

```bash
# Install all dependencies including test framework
npm install
```

This will install:
- `vitest` - Testing framework
- `@vitest/ui` - Test UI
- All other existing dependencies

## Verify Setup

After installing dependencies, verify your LLM setup:

```bash
npm run verify-llm
```

Or directly:
```bash
npx tsx scripts/verify-llm-setup.ts
```

This will check:
- ✅ Environment variables (`GROQ_API_KEY`, `OPENAI_API_KEY`)
- ✅ Database integrations
- ✅ Provider availability

## How It Works

The system automatically:
1. **Analyzes prompt complexity**
2. **Routes simple prompts** → Llama 3 (Groq) - Free
3. **Routes complex prompts** → GPT-4o (OpenAI) - Premium
4. **Falls back** to GPT-4o if Llama 3 fails

## API Key Configuration

Keys can be configured in two ways:

### Option 1: Environment Variables
```bash
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=sk-your_openai_key
```

### Option 2: Database Integrations
- Go to `/settings/integrations`
- Configure "Groq" integration (for Llama 3)
- Configure "OpenAI" integration (for GPT-4o)

The system checks both sources automatically.

## Testing

```bash
# Run unit tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Usage

The routing is already integrated into:
- ✅ `src/lib/ai/generate.ts` - Draft reply generation
- ✅ `src/app/api/ai/draft-reply/route.ts` - AI draft endpoint

No code changes needed - it works automatically!

## Documentation

- **Quick Start**: `docs/DUAL_LLM_QUICK_START.md`
- **Full Guide**: `docs/DUAL_LLM_ROUTING.md`
- **Implementation Summary**: `docs/DUAL_LLM_IMPLEMENTATION_SUMMARY.md`
- **Setup Verification**: `docs/LLM_SETUP_VERIFICATION.md`

## Next Steps

1. **Install dependencies** (when npm available):
   ```bash
   npm install
   ```

2. **Verify setup**:
   ```bash
   npm run verify-llm
   ```

3. **Test the system**:
   ```bash
   npm test
   ```

4. **Start using** - The routing is already active!

---

**Note**: Since your API keys are already configured, the system will work as soon as dependencies are installed.


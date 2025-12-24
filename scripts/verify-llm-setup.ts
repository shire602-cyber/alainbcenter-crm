/**
 * Verify LLM Setup
 * 
 * Checks if Groq and OpenAI API keys are configured
 * Run with: npx tsx scripts/verify-llm-setup.ts
 */

import { prisma } from '../src/lib/prisma'

async function verifySetup() {
  console.log('🔍 Verifying LLM Setup...\n')

  // Check environment variables
  const groqEnvKey = process.env.GROQ_API_KEY
  const openaiEnvKey = process.env.OPENAI_API_KEY

  console.log('📋 Environment Variables:')
  console.log(`  GROQ_API_KEY: ${groqEnvKey ? '✅ Set' : '❌ Not set'}`)
  console.log(`  OPENAI_API_KEY: ${openaiEnvKey ? '✅ Set' : '❌ Not set'}\n`)

  // Check database integrations
  try {
    const groqIntegration = await prisma.integration.findUnique({
      where: { name: 'groq' },
      select: { isEnabled: true, apiKey: true },
    })

    const openaiIntegration = await prisma.integration.findUnique({
      where: { name: 'openai' },
      select: { isEnabled: true, apiKey: true },
    })

    console.log('📋 Database Integrations:')
    console.log(`  Groq Integration: ${groqIntegration?.isEnabled && groqIntegration?.apiKey ? '✅ Configured' : '❌ Not configured'}`)
    console.log(`  OpenAI Integration: ${openaiIntegration?.isEnabled && openaiIntegration?.apiKey ? '✅ Configured' : '❌ Not configured'}\n`)

    // Overall status
    const groqAvailable = groqEnvKey || (groqIntegration?.isEnabled && groqIntegration?.apiKey)
    const openaiAvailable = openaiEnvKey || (openaiIntegration?.isEnabled && openaiIntegration?.apiKey)

    console.log('🎯 Overall Status:')
    console.log(`  Llama 3 (Groq): ${groqAvailable ? '✅ Available' : '❌ Not available'}`)
    console.log(`  GPT-4o (OpenAI): ${openaiAvailable ? '✅ Available' : '❌ Not available'}\n`)

    if (groqAvailable && openaiAvailable) {
      console.log('✅ Dual-LLM routing is ready!')
      console.log('   - Simple prompts will use Llama 3 (free)')
      console.log('   - Complex prompts will use GPT-4o (premium)')
      console.log('   - Automatic fallback if Llama 3 fails\n')
    } else if (openaiAvailable) {
      console.log('⚠️  Only OpenAI is available')
      console.log('   - All prompts will use GPT-4o')
      console.log('   - Consider adding Groq API key for cost savings\n')
    } else {
      console.log('❌ No LLM providers are available')
      console.log('   - Set GROQ_API_KEY or configure Groq integration')
      console.log('   - Set OPENAI_API_KEY or configure OpenAI integration\n')
    }

    // Test providers
    if (groqAvailable || openaiAvailable) {
      console.log('🧪 Testing Providers...\n')
      
      if (groqAvailable) {
        try {
          const { Llama3Provider } = await import('../src/lib/llm/providers/llama3')
          const provider = new Llama3Provider()
          const available = await provider.isAvailable()
          console.log(`  Llama 3 (Groq): ${available ? '✅ Available' : '❌ Not available'}`)
        } catch (error: any) {
          console.log(`  Llama 3 (Groq): ❌ Error - ${error.message}`)
        }
      }

      if (openaiAvailable) {
        try {
          const { OpenAIProvider } = await import('../src/lib/llm/providers/openai')
          const provider = new OpenAIProvider()
          const available = await provider.isAvailable()
          console.log(`  GPT-4o (OpenAI): ${available ? '✅ Available' : '❌ Not available'}`)
        } catch (error: any) {
          console.log(`  GPT-4o (OpenAI): ❌ Error - ${error.message}`)
        }
      }
    }
  } catch (error: any) {
    console.error('❌ Error checking integrations:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

verifySetup().catch(console.error)


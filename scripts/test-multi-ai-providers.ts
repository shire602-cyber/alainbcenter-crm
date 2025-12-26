/**
 * Test script to verify multiple AI provider configuration
 * Run with: npx tsx scripts/test-multi-ai-providers.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testMultiProviderConfig() {
  console.log('🧪 Testing Multi-AI Provider Configuration\n')

  const providers = ['deepseek', 'openai', 'groq', 'anthropic']

  // Check all provider integrations exist
  console.log('📋 Checking provider integrations...')
  for (const providerName of providers) {
    const integration = await prisma.integration.findUnique({
      where: { name: providerName },
    })

    if (integration) {
      let config: any = {}
      try {
        config = integration.config ? JSON.parse(integration.config) : {}
      } catch {
        config = {}
      }

      console.log(`\n✅ ${providerName.toUpperCase()}:`)
      console.log(`   - Enabled: ${integration.isEnabled ? '✅' : '❌'}`)
      console.log(`   - Has API Key: ${integration.apiKey ? '✅' : '❌'}`)
      console.log(`   - Model: ${config.model || 'not set'}`)
      console.log(`   - Provider: ${config.provider || integration.provider}`)
    } else {
      console.log(`\n❌ ${providerName.toUpperCase()}: Integration not found`)
    }
  }

  // Test routing service availability
  console.log('\n\n🔄 Testing Provider Availability...')
  try {
    const { DeepSeekProvider } = await import('../src/lib/llm/providers/deepseek')
    const { OpenAIProvider } = await import('../src/lib/llm/providers/openai')
    const { Llama3Provider } = await import('../src/lib/llm/providers/llama3')
    const { AnthropicProvider } = await import('../src/lib/llm/providers/anthropic')

    const deepseek = new DeepSeekProvider()
    const openai = new OpenAIProvider()
    const groq = new Llama3Provider()
    const anthropic = new AnthropicProvider()

    const deepseekAvailable = await deepseek.isAvailable()
    const openaiAvailable = await openai.isAvailable()
    const groqAvailable = await groq.isAvailable()
    const anthropicAvailable = await anthropic.isAvailable()

    console.log(`\n✅ DeepSeek: ${deepseekAvailable ? 'Available' : 'Not Available'}`)
    console.log(`✅ OpenAI: ${openaiAvailable ? 'Available' : 'Not Available'}`)
    console.log(`✅ Groq: ${groqAvailable ? 'Available' : 'Not Available'}`)
    console.log(`✅ Anthropic: ${anthropicAvailable ? 'Available' : 'Not Available'}`)

    const availableCount = [deepseekAvailable, openaiAvailable, groqAvailable, anthropicAvailable].filter(Boolean).length
    console.log(`\n📊 Total Available Providers: ${availableCount}/4`)

    if (availableCount === 0) {
      console.log('\n⚠️  WARNING: No providers are configured. Please configure at least one provider in the AI Integration settings.')
    } else if (availableCount === 1) {
      console.log('\n⚠️  WARNING: Only one provider is configured. Consider configuring multiple providers for better reliability.')
    } else {
      console.log('\n✅ Multiple providers configured! The system will use DeepSeek as primary with automatic fallback.')
    }
  } catch (error: any) {
    console.error('❌ Error testing providers:', error.message)
  }

  console.log('\n✅ Test complete!\n')
}

testMultiProviderConfig()
  .catch((error) => {
    console.error('Test failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


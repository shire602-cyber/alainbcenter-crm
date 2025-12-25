#!/usr/bin/env tsx
/**
 * Diagnostic script to check AI configuration
 * Run: npx tsx scripts/check-ai-config.ts
 */

import { getAIConfig, isAIConfigured } from '../src/lib/ai/client'
import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('🔍 Checking AI Configuration...\n')

  // Check environment variables
  console.log('📋 Environment Variables:')
  console.log(`   GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Not set'}`)
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`)
  console.log(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`)

  // Check database integrations
  console.log('\n📋 Database Integrations:')
  try {
    const groqIntegration = await prisma.integration.findUnique({
      where: { name: 'groq' },
    })
    console.log(`   Groq: ${groqIntegration?.isEnabled && groqIntegration.apiKey ? '✅ Configured' : '❌ Not configured'}`)

    const openaiIntegration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })
    console.log(`   OpenAI: ${openaiIntegration?.isEnabled && openaiIntegration.apiKey ? '✅ Configured' : '❌ Not configured'}`)

    const anthropicIntegration = await prisma.integration.findUnique({
      where: { name: 'anthropic' },
    })
    console.log(`   Anthropic: ${anthropicIntegration?.isEnabled && anthropicIntegration.apiKey ? '✅ Configured' : '❌ Not configured'}`)
  } catch (error: any) {
    console.error('   ❌ Error checking integrations:', error.message)
  }

  // Check if AI is configured
  console.log('\n🤖 AI Configuration Status:')
  try {
    const configured = await isAIConfigured()
    if (configured) {
      const config = await getAIConfig()
      console.log(`   ✅ AI is CONFIGURED`)
      console.log(`   Provider: ${config?.provider}`)
      console.log(`   Model: ${config?.model}`)
      console.log(`   API Key: ${config?.apiKey ? '✅ Present' : '❌ Missing'}`)
    } else {
      console.log(`   ❌ AI is NOT CONFIGURED`)
      console.log(`   ⚠️  Set one of: GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY`)
      console.log(`   ⚠️  Or configure in admin panel: /settings/integrations/ai`)
    }
  } catch (error: any) {
    console.error('   ❌ Error checking AI config:', error.message)
  }

  console.log('\n✅ Diagnostic complete')
  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})


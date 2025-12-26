import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { MultiAIProviderSettings } from '@/components/settings/MultiAIProviderSettings'
import { Sparkles } from 'lucide-react'
import { prisma } from '@/lib/prisma'

export default async function AIIntegrationsPage() {
  await requireAdmin()

  // Ensure all AI provider integrations exist
  const providers = ['deepseek', 'openai', 'groq', 'anthropic']
  const defaultConfigs: Record<string, { model: string; provider: string }> = {
    deepseek: { model: 'deepseek-chat', provider: 'deepseek' },
    openai: { model: 'gpt-4o-mini', provider: 'openai' },
    groq: { model: 'llama-3.1-8b-instant', provider: 'groq' },
    anthropic: { model: 'claude-3-5-haiku-20241022', provider: 'anthropic' },
  }

  for (const providerName of providers) {
    const existing = await prisma.integration.findUnique({
      where: { name: providerName },
    })

    if (!existing) {
      const defaultConfig = defaultConfigs[providerName]
      await prisma.integration.create({
        data: {
          name: providerName,
          provider: providerName,
          isEnabled: false,
          config: JSON.stringify(defaultConfig),
        },
      })
    }
  }

  // Fetch all AI provider integrations
  const allIntegrations = await prisma.integration.findMany({
    where: {
      name: {
        in: providers,
      },
    },
  })

  // Convert to record format for component
  const integrationsRecord: Record<string, any> = {}
  allIntegrations.forEach(integration => {
    integrationsRecord[integration.name] = {
      ...integration,
      lastTestedAt: integration.lastTestedAt ? integration.lastTestedAt.toISOString() : null,
    }
  })

  // Ensure all providers are in the record (even if null)
  providers.forEach(providerName => {
    if (!integrationsRecord[providerName]) {
      integrationsRecord[providerName] = null
    }
  })

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-orange-500" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI Integration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure multiple AI providers for draft generation and automation. Each provider can have its own API key.
            </p>
          </div>
        </div>

        <MultiAIProviderSettings initialIntegrations={integrationsRecord} />
      </div>
    </MainLayout>
  )
}












import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AIIntegrationSettings } from '@/components/settings/AIIntegrationSettings'
import { Sparkles } from 'lucide-react'
import { prisma } from '@/lib/prisma'

export default async function AIIntegrationsPage() {
  await requireAdmin()

  // Ensure AI integration exists
  const aiIntegration = await prisma.integration.findUnique({
    where: { name: 'openai' },
  })

  if (!aiIntegration) {
    await prisma.integration.create({
      data: {
        name: 'openai',
        provider: 'openai',
        isEnabled: false,
        config: JSON.stringify({
          model: 'gpt-4o-mini',
          provider: 'openai'
        }),
      },
    })
  }

  const integration = await prisma.integration.findUnique({
    where: { name: 'openai' },
  })

  // Convert Prisma Date to string for component
  const integrationForComponent = integration ? {
    ...integration,
    lastTestedAt: integration.lastTestedAt ? integration.lastTestedAt.toISOString() : null,
  } : null

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-8 w-8 text-orange-500" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">AI Integration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure AI models for draft generation and automation
            </p>
          </div>
        </div>

        <AIIntegrationSettings initialIntegration={integrationForComponent} />
      </div>
    </MainLayout>
  )
}












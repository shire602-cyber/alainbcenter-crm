import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IntegrationSettings } from '@/components/admin/IntegrationSettings'
import { IntegrationIcon } from '@/components/admin/IntegrationIcon'
import { MetaTesterIntegration } from '@/components/admin/MetaTesterIntegration'
import { MetaTesterIntegration } from '@/components/admin/MetaTesterIntegration'
import { 
  Settings,
  CheckCircle2,
  XCircle,
  Plug2,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function IntegrationsPage() {
  await requireAdmin()

  // Ensure all integrations exist (auto-seed)
  // Generate a secure verify token for WhatsApp if not exists
  const generateVerifyToken = () => {
    return `wa-verify-${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`
  }

  const requiredIntegrations = [
    { name: 'whatsapp', provider: 'Meta Cloud API', config: JSON.stringify({}) },
    { name: 'email', provider: 'Gmail', config: JSON.stringify({}) },
    { name: 'facebook', provider: 'Meta Lead Ads', config: JSON.stringify({}) },
    { name: 'instagram', provider: 'Meta Lead Ads', config: JSON.stringify({}) },
    { name: 'instagram-messaging', provider: 'Meta Messaging API', config: JSON.stringify({}) },
    // AI Providers - each has its own integration
    { name: 'deepseek', provider: 'DeepSeek API', config: JSON.stringify({ model: 'deepseek-chat', provider: 'deepseek' }) },
    { name: 'openai', provider: 'OpenAI API', config: JSON.stringify({ model: 'gpt-4o-mini', provider: 'openai' }) },
    { name: 'groq', provider: 'Groq API', config: JSON.stringify({ model: 'llama-3.1-8b-instant', provider: 'groq' }) },
    { name: 'anthropic', provider: 'Anthropic API', config: JSON.stringify({ model: 'claude-3-5-haiku-20241022', provider: 'anthropic' }) },
  ]

  for (const integration of requiredIntegrations) {
    try {
      const existing = await prisma.integration.findUnique({
        where: { name: integration.name },
      })

      if (existing) {
        // If WhatsApp exists but has no verify token, generate one
        if (integration.name === 'whatsapp') {
          let config: Record<string, any> = {}
          try {
            config = existing.config ? JSON.parse(existing.config) : {}
          } catch {
            config = {}
          }

          if (!config.webhookVerifyToken) {
            const verifyToken = generateVerifyToken()
            await prisma.integration.update({
              where: { name: 'whatsapp' },
              data: {
                config: JSON.stringify({
                  ...config,
                  webhookVerifyToken: verifyToken,
                }),
              },
            })
          }
        }
        continue
      }

      // Create new integration
      let config = integration.config ? JSON.parse(integration.config) : {}
      if (integration.name === 'whatsapp' && !config.webhookVerifyToken) {
        config.webhookVerifyToken = generateVerifyToken()
      }

      await prisma.integration.create({
        data: {
          name: integration.name,
          provider: integration.provider,
          isEnabled: false,
          config: JSON.stringify(config),
        },
      })
    } catch (error) {
      console.error(`Failed to seed ${integration.name}:`, error)
    }
  }

  const integrations = await prisma.integration.findMany({
    orderBy: { name: 'asc' }
  }).catch(() => [])

  // Check Meta connections using Prisma models
  const metaConnections = await prisma.metaConnection.findMany({
    where: {
      status: 'connected',
    },
    select: {
      id: true,
      pageId: true,
      pageName: true,
      igUsername: true,
      triggerSubscribed: true,
      status: true,
      lastError: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  }).catch(() => [])

  const hasMetaConnection = metaConnections.length > 0

  const integrationTypes = [
    {
      name: 'whatsapp',
      label: 'WhatsApp',
      iconName: 'MessageSquare',
      description: 'Connect WhatsApp Business API for messaging',
      providers: ['360dialog', 'Twilio', 'Meta Cloud API', 'Wati'],
    },
    {
      name: 'email',
      label: 'Email',
      iconName: 'Mail',
      description: 'Configure SMTP for email sending',
      providers: ['Gmail', 'SendGrid', 'Mailgun', 'SMTP'],
    },
    {
      name: 'facebook',
      label: 'Facebook Lead Ads',
      iconName: 'Facebook',
      description: 'Connect Facebook Lead Ads for lead capture',
      providers: ['Meta Lead Ads'],
    },
    {
      name: 'instagram',
      label: 'Instagram Lead Ads',
      iconName: 'Instagram',
      description: 'Connect Instagram Lead Ads for lead capture',
      providers: ['Meta Lead Ads'],
    },
    {
      name: 'instagram-messaging',
      label: 'Instagram Direct Messages',
      iconName: 'Instagram',
      description: 'Connect Instagram Messaging API for DMs using Meta tester token',
      providers: ['Meta Messaging API'],
      isMetaTester: true,
    },
    {
      name: 'openai',
      label: 'AI Models',
      iconName: 'Brain',
      description: 'Configure AI models (OpenAI, Groq, Anthropic) for draft generation',
      providers: ['OpenAI API', 'Groq', 'Anthropic'],
      settingsUrl: '/settings/integrations/ai',
    },
  ]

  const enabledCount = integrations.filter((i) => i.isEnabled).length

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage API connections for WhatsApp, Email, Social Media, and AI services
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KPICard
            title="Total Integrations"
            value={integrationTypes.length}
            icon={<Plug2 className="h-4 w-4 text-slate-400 dark:text-slate-600" />}
          />
          <KPICard
            title="Enabled"
            value={enabledCount}
            icon={<CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
          />
          <KPICard
            title="Disabled"
            value={integrationTypes.length - enabledCount}
            icon={<XCircle className="h-4 w-4 text-slate-400 dark:text-slate-600" />}
          />
        </div>

        {/* Integration Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {integrationTypes.map((type) => {
            const integration = integrations.find((i) => i.name === type.name)
            // For Meta tester integration, check if we have active connections
            const isEnabled = type.name === 'instagram-messaging' && (type as any).isMetaTester
              ? hasMetaConnection 
              : (integration?.isEnabled || false)

            return (
              <BentoCard 
                key={type.name}
                title={type.label}
                icon={
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isEnabled ? 'bg-green-100 dark:bg-green-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <IntegrationIcon iconName={type.iconName} isEnabled={isEnabled} />
                  </div>
                }
                badge={
                  <Badge variant={isEnabled ? 'default' : 'secondary'} className="shrink-0 flex items-center gap-1.5 text-xs">
                    {isEnabled ? (
                      <>
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3" />
                        Disconnected
                      </>
                    )}
                  </Badge>
                }
              >
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{type.description}</p>
                
                {type.name === 'instagram-messaging' && (type as any).isMetaTester ? (
                  <MetaTesterIntegration 
                    connections={metaConnections}
                    hasConnection={hasMetaConnection}
                  />
                ) : type.name === 'openai' && type.settingsUrl ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Configure AI models, providers, and pricing in the dedicated AI settings page.
                    </p>
                    <Link href={type.settingsUrl}>
                      <Button variant="default" size="sm" className="w-full gap-2 text-xs h-8">
                        <Sparkles className="h-3.5 w-3.5" />
                        Configure AI Models
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <IntegrationSettings 
                    integration={integration ? {
                      id: integration.id,
                      name: integration.name,
                      provider: integration.provider,
                      isEnabled: integration.isEnabled,
                      apiKey: integration.apiKey,
                      apiSecret: integration.apiSecret,
                      webhookUrl: integration.webhookUrl,
                      accessToken: integration.accessToken,
                      config: integration.config,
                      lastTestedAt: integration.lastTestedAt ? new Date(integration.lastTestedAt).toISOString() : null,
                      lastTestStatus: integration.lastTestStatus,
                      lastTestMessage: integration.lastTestMessage,
                    } : null}
                    type={{
                      name: type.name,
                      label: type.label,
                      providers: type.providers,
                    }}
                  />
                )}
              </BentoCard>
            )
          })}
        </div>
      </div>
    </MainLayout>
  )
}

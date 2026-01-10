import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { WhatsAppTemplatesClient } from '@/components/settings/WhatsAppTemplatesClient'
import { prisma } from '@/lib/prisma'
import { MessageSquare } from 'lucide-react'

export default async function WhatsAppTemplatesPage() {
  await requireAdmin()

  // Get all templates (safely handle if model doesn't exist yet)
  let templates: any[] = []
  try {
    templates = await (prisma as any).whatsAppTemplate?.findMany({
      orderBy: { createdAt: 'desc' },
    })
  } catch (error: any) {
    // Model doesn't exist yet - will show empty state
    console.warn('WhatsAppTemplate model not available yet')
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-100">
              <MessageSquare className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                WhatsApp Templates
              </h1>
              <p className="text-muted-foreground mt-1 text-lg">
                Manage WhatsApp message templates
              </p>
            </div>
          </div>
        </div>

        <WhatsAppTemplatesClient initialTemplates={templates} />
      </div>
    </MainLayout>
  )
}

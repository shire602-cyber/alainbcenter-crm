import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { WhatsAppSettingsClient } from '@/components/settings/WhatsAppSettingsClient'
import { MessageSquare } from 'lucide-react'

export default async function WhatsAppSettingsPage() {
  await requireAdmin()

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-100">
              <MessageSquare className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                WhatsApp Settings
              </h1>
              <p className="text-muted-foreground mt-1 text-lg">
                Configure WhatsApp Cloud API integration
              </p>
            </div>
          </div>
        </div>

        <WhatsAppSettingsClient />
      </div>
    </MainLayout>
  )
}

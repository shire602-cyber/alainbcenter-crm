import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { MetaIntegrationSettings } from '@/components/settings/MetaIntegrationSettings'

export default async function MetaSettingsPage() {
  await requireAdmin()

  return (
    <MainLayout>
      <MetaIntegrationSettings />
    </MainLayout>
  )
}

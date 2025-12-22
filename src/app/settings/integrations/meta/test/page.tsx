import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { MetaTestTool } from '@/components/settings/MetaTestTool'

export default async function MetaTestPage() {
  await requireAdmin()

  return (
    <MainLayout>
      <MetaTestTool />
    </MainLayout>
  )
}

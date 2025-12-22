import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { AutomationLogsView } from '@/components/automation/AutomationLogsView'

export default async function AutomationLogsPage() {
  await requireAdmin()

  return (
    <MainLayout>
      <AutomationLogsView />
    </MainLayout>
  )
}

import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { AutomationRulesManager } from '@/components/automation/AutomationRulesManager'
import { ensureAutomationRulesSeeded } from '@/lib/automation-seed'

export default async function AutomationPage() {
  await requireAdmin()
  
  // Seed default rules if none exist
  await ensureAutomationRulesSeeded()

  return (
    <MainLayout>
      <AutomationRulesManager />
    </MainLayout>
  )
}

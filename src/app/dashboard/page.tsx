import { requireAuth } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { CommandCenterDashboard } from '@/components/dashboard/CommandCenterDashboard'

export default async function DashboardPage() {
  await requireAuth()
  
  return (
    <MainLayout>
      <CommandCenterDashboard />
    </MainLayout>
  )
}


import { MainLayout } from '@/components/layout/MainLayout'
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton'

export default function DashboardLoading() {
  return (
    <MainLayout>
      <DashboardSkeleton />
    </MainLayout>
  )
}


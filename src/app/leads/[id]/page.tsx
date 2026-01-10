'use client'

/**
 * LEAD DETAIL PAGE
 * Uses the premium component with all lead information sections
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { User } from 'lucide-react'
import LeadDetailPagePremium from './LeadDetailPagePremium'

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const router = useRouter()
  const [leadId, setLeadId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const resolved = await params
        const id = parseInt(resolved.id)
        if (isNaN(id)) {
          router.push('/leads')
          return
        }
        setLeadId(id)
      } catch (error) {
        console.error('Failed to initialize:', error)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [params, router])

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-3 space-y-4">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <div className="col-span-12 lg:col-span-6">
              <Skeleton className="h-[600px]" />
            </div>
            <div className="col-span-12 lg:col-span-3">
              <Skeleton className="h-[600px]" />
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!leadId) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-screen">
          <EmptyState
            icon={User}
            title="Lead not found"
            description="The lead you're looking for doesn't exist"
            action={
              <Button onClick={() => router.push('/leads')}>
                Back to Leads
              </Button>
            }
          />
        </div>
      </MainLayout>
    )
  }

  return <LeadDetailPagePremium leadId={leadId} />
}

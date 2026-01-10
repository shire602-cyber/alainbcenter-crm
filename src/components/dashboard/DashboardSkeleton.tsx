'use client'

import { Skeleton } from '@/components/ui/skeleton'

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid gap-2 md:grid-cols-3">
        {/* Left Column */}
        <div className="md:col-span-2 space-y-2">
          {/* My Day */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-2">
          {/* Renewals */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </div>

          {/* Lead Quality */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


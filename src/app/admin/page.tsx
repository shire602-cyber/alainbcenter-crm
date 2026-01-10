import { requireAdmin } from '@/lib/auth-server'
import { MainLayout } from '@/components/layout/MainLayout'
import { BentoCard } from '@/components/dashboard/BentoCard'
import { KPICard } from '@/components/dashboard/KPICard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import {
  Users,
  Briefcase,
  TrendingUp,
  Settings,
  Plug2,
  Zap,
  FileText,
  BarChart3,
  ArrowRight,
  Shield,
  Palette,
} from 'lucide-react'

export default async function AdminPage() {
  await requireAdmin()

  const [serviceCount, userCount, leadCount, activeServices] = await Promise.all([
    prisma.serviceType.count(),
    prisma.user.count(),
    prisma.lead.count(),
    prisma.serviceType.count({
      where: { isActive: true },
    }),
  ])

  const adminUsers = await prisma.user.count({
    where: { role: 'admin' },
  })

  const stats = [
    {
      title: 'Total Services',
      value: serviceCount,
      subtitle: `${activeServices} active`,
      icon: Briefcase,
      href: '/admin/services',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Total Users',
      value: userCount,
      subtitle: `${adminUsers} admins`,
      icon: Users,
      href: '/admin/users',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Total Leads',
      value: leadCount,
      subtitle: 'All time',
      icon: TrendingUp,
      href: '/leads',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ]

  const quickLinks = [
    {
      title: 'Service Types',
      description: 'Manage business services (Business Setup, Visas, etc.)',
      icon: Briefcase,
      href: '/admin/services',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'User Management',
      description: 'View and manage user accounts and roles',
      icon: Users,
      href: '/admin/users',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Integrations',
      description: 'Connect WhatsApp, Email, Facebook, Instagram, and OpenAI',
      icon: Plug2,
      href: '/admin/integrations',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Reports',
      description: 'View lead statistics and analytics',
      icon: BarChart3,
      href: '/reports',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      title: 'Leads Management',
      description: 'Manage leads and pipeline stages',
      icon: TrendingUp,
      href: '/leads',
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-display text-slate-900">
              Admin Dashboard
            </h1>
            <p className="text-sm text-slate-600 mt-2 font-medium">
              Manage services, users, integrations, and system settings
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Link key={stat.title} href={stat.href} className="block">
                <BentoCard className="group cursor-pointer">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5 mb-2">
                        <Icon className={`h-5 w-5 ${stat.color}`} />
                        <span className="text-caption font-bold text-slate-700 uppercase tracking-wider">
                          {stat.title}
                        </span>
                      </div>
                      <p className="text-display text-slate-900 mb-1">
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </p>
                      <p className="text-xs text-slate-600 font-medium">{stat.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-slate-200/60">
                    <span className="text-caption text-slate-900 font-semibold group-hover:text-slate-900 transition-colors">View Details</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-700 group-hover:translate-x-1 transition-transform" />
                  </div>
                </BentoCard>
              </Link>
            )
          })}
        </div>

        {/* Quick Links Grid */}
        <BentoCard title="Quick Links" icon={<Zap className="h-4 w-4" />}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quickLinks.map((link) => {
              const Icon = link.icon
              return (
                <Link 
                  key={link.title} 
                  href={link.href}
                  className="group block p-4 rounded-xl border border-slate-200/60 hover:border-slate-300 hover:shadow-md bg-white transition-all duration-300"
                >
                  <div className={`inline-flex p-2.5 rounded-xl ${link.bgColor} mb-3 group-hover:scale-105 transition-transform`}>
                    <Icon className={`h-4 w-4 ${link.color}`} />
                  </div>
                  <h3 className="text-body font-bold text-slate-900 mb-1.5">{link.title}</h3>
                  <p className="text-caption text-slate-600 mb-3 leading-relaxed">{link.description}</p>
                  <div className="flex items-center gap-1.5 text-caption text-slate-900 font-semibold">
                    <span>Open</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              )
            })}
          </div>
        </BentoCard>
      </div>
    </MainLayout>
  )
}

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
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
    {
      title: 'Total Users',
      value: userCount,
      subtitle: `${adminUsers} admins`,
      icon: Users,
      href: '/admin/users',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      title: 'Total Leads',
      value: leadCount,
      subtitle: 'All time',
      icon: TrendingUp,
      href: '/leads',
      color: 'text-green-600',
      bgColor: 'bg-green-100 dark:bg-green-900/20',
    },
  ]

  const quickLinks = [
    {
      title: 'Service Types',
      description: 'Manage business services (Business Setup, Visas, etc.)',
      icon: Briefcase,
      href: '/admin/services',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/10',
    },
    {
      title: 'User Management',
      description: 'View and manage user accounts and roles',
      icon: Users,
      href: '/admin/users',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/10',
    },
    {
      title: 'Integrations',
      description: 'Connect WhatsApp, Email, Facebook, Instagram, and OpenAI',
      icon: Plug2,
      href: '/admin/integrations',
      color: 'text-green-600',
      bgColor: 'bg-green-50 dark:bg-green-900/10',
    },
    {
      title: 'Automation Rules',
      description: 'Configure automated messages and reminders',
      icon: Zap,
      href: '/admin/automation',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 dark:bg-orange-900/10',
    },
    {
      title: 'Reports',
      description: 'View lead statistics and analytics',
      icon: BarChart3,
      href: '/reports',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/10',
    },
    {
      title: 'Leads Management',
      description: 'Manage leads and pipeline stages',
      icon: TrendingUp,
      href: '/leads',
      color: 'text-pink-600',
      bgColor: 'bg-pink-50 dark:bg-pink-900/10',
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Admin Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage services, users, integrations, and system settings
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon
            return (
              <Link key={stat.title} href={stat.href} className="block">
                <BentoCard className="group cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`h-4 w-4 ${stat.color}`} />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                          {stat.title}
                        </span>
                      </div>
                      <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-0.5">
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{stat.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-xs text-primary font-medium">View Details</span>
                    <ArrowRight className="h-3 w-3 text-primary group-hover:translate-x-0.5 transition-transform" />
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
                  className="group block p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
                >
                  <div className={`inline-flex p-2 rounded-lg ${link.bgColor} mb-2 group-hover:scale-105 transition-transform`}>
                    <Icon className={`h-4 w-4 ${link.color}`} />
                  </div>
                  <h3 className="text-sm font-semibold tracking-tight text-foreground mb-1">{link.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{link.description}</p>
                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                    <span>Open</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
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

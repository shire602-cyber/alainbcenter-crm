import { notFound } from 'next/navigation'
import { requireAdminOrManager } from '@/lib/auth-server'
import RenewalsDashboard from './RenewalsDashboard'

export default async function RenewalsPage() {
  try {
    await requireAdminOrManager()
    return <RenewalsDashboard />
  } catch {
    notFound()
  }
}












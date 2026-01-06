import { notFound } from 'next/navigation'
import { requireAdminOrManager } from '@/lib/auth-server'
import RenewalCommandCenter from './RenewalCommandCenter'

export default async function RenewalsPage() {
  try {
    await requireAdminOrManager()
    return <RenewalCommandCenter />
  } catch {
    notFound()
  }
}












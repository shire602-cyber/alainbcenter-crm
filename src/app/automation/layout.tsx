import { requireAdmin } from '@/lib/auth-server'

export default async function AutomationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()
  return <>{children}</>
}












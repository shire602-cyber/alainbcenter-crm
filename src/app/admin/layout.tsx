import { requireAdmin } from '@/lib/auth-server'

/**
 * Admin Layout
 * 
 * Simply ensures user is admin - no layout wrapper needed
 * All admin pages use MainLayout for consistent styling
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Ensure user is admin
  await requireAdmin()

  // Return children directly - MainLayout handles the actual layout
  return <>{children}</>
}


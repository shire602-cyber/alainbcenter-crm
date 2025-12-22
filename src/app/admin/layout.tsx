import { requireAdmin } from '@/lib/auth-server'
import Link from 'next/link'
import LogoutButton from '@/components/LogoutButton'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Ensure user is admin
  const user = await requireAdmin()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
              <p className="text-sm text-gray-600">Manage services and users</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                {user.name} ({user.role})
              </span>
              <Link
                href="/"
                className="text-sm text-blue-600 hover:underline"
              >
                ← Back to Dashboard
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-6">
            <Link
              href="/admin"
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:border-gray-300"
            >
              Overview
            </Link>
            <Link
              href="/admin/services"
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:border-gray-300"
            >
              Services
            </Link>
            <Link
              href="/admin/users"
              className="px-4 py-3 text-sm font-medium border-b-2 border-transparent hover:border-gray-300"
            >
              Users
            </Link>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {children}
      </div>
    </div>
  )
}


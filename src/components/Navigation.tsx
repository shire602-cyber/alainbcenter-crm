'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Navigation() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Check if user is admin (you'll need to implement this based on your auth)
    // For now, always show navigation - auth checks happen at page level
    setIsAdmin(false) // TODO: Implement actual admin check
  }, [])

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <Link href="/" className="text-xl font-bold">
            Alain Business Center CRM
          </Link>
          <div className="flex gap-6">
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Dashboard
            </Link>
            <Link
              href="/leads"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Leads
            </Link>
            <Link
              href="/leads/kanban"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Kanban
            </Link>
            <Link
              href="/reports"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Reports
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className="text-sm text-purple-600 hover:text-purple-900"
              >
                Admin
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}


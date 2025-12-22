'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle2, Shield } from 'lucide-react'

export default function DebugAdminPage() {
  const [userInfo, setUserInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [makingAdmin, setMakingAdmin] = useState(false)

  useEffect(() => {
    checkRole()
  }, [])

  async function checkRole() {
    try {
      setLoading(true)
      const res = await fetch('/api/debug/check-role')
      const data = await res.json()
      setUserInfo(data)
    } catch (error) {
      console.error('Failed to check role:', error)
    } finally {
      setLoading(false)
    }
  }

  async function makeAdmin() {
    try {
      setMakingAdmin(true)
      const res = await fetch('/api/debug/make-admin', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert('Success! You are now an admin. Please refresh the page.')
        window.location.reload()
      } else {
        alert('Error: ' + (data.error || 'Failed to make admin'))
      }
    } catch (error) {
      console.error('Failed to make admin:', error)
      alert('Failed to make admin. Check console for details.')
    } finally {
      setMakingAdmin(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <Card>
          <CardContent className="p-6">
            <p>Loading...</p>
          </CardContent>
        </Card>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-primary" />
              <CardTitle>Admin Access Debug</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {userInfo?.authenticated ? (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">User Information</p>
                  <div className="p-4 bg-secondary rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Name:</span>
                      <span className="font-medium">{userInfo.user?.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Email:</span>
                      <span className="font-medium">{userInfo.user?.email}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Role:</span>
                      <Badge
                        variant={userInfo.isAdmin ? 'success' : 'secondary'}
                        className="font-medium"
                      >
                        {userInfo.user?.role || 'unknown'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {userInfo.isAdmin ? (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-900 dark:text-green-100">
                        You are an admin!
                      </p>
                      <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                        Admin menu items should be visible in the sidebar. If not, try refreshing the page.
                      </p>
                      <div className="mt-3 space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => (window.location.href = '/admin')}
                        >
                          Go to Admin Panel
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => (window.location.href = '/admin/integrations')}
                          className="ml-2"
                        >
                          Go to Integrations
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-900 dark:text-yellow-100">
                        You are not an admin
                      </p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                        {userInfo.message}
                      </p>
                      {process.env.NODE_ENV === 'development' && (
                        <div className="mt-4">
                          <Button
                            onClick={makeAdmin}
                            disabled={makingAdmin}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {makingAdmin ? 'Making Admin...' : 'Make Me Admin (Dev Only)'}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            This button only works in development mode.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-900 dark:text-red-100">
                  You are not authenticated. Please log in first.
                </p>
              </div>
            )}

            <div className="pt-4 border-t">
              <Button variant="outline" onClick={checkRole} size="sm">
                Refresh Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}























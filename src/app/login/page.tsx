'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    
    // Client-side validation
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    
    if (!password) {
      setError('Please enter your password')
      return
    }
    
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: email.trim(), password }),
        credentials: 'include', // CRITICAL: Must include credentials for cookies
      })

      console.log('[CLIENT] Response status:', res.status)
      console.log('[CLIENT] Response headers:', Object.fromEntries(res.headers.entries()))

      if (!res.ok) {
        // Handle error response (should return JSON)
        const contentType = res.headers.get('content-type')
        console.log('[CLIENT] Error response, content-type:', contentType)
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json()
          console.error('[CLIENT] Error data:', errorData)
          throw new Error(errorData.error || 'Login failed')
        } else {
          // Got non-JSON error response
          const text = await res.text()
          console.error('[CLIENT] Non-JSON error response:', text.substring(0, 200))
          throw new Error(`Login failed - server returned ${res.status}`)
        }
      }

      // Parse success response
      const data = await res.json()
      console.log('[CLIENT] ✅ Login successful! Response data:', data)
      
      // Check if cookie was set (httpOnly cookies won't show in document.cookie, but we can check headers)
      const setCookieHeader = res.headers.get('set-cookie')
      console.log('[CLIENT] Set-Cookie header:', setCookieHeader)
      
      // Note: httpOnly cookies won't appear in document.cookie, that's expected
      console.log('[CLIENT] document.cookie (may not show httpOnly cookies):', document.cookie)
      
      console.log('[CLIENT] Redirecting to:', data.redirect || '/')
      
      // Use replace instead of href to avoid back button issues
      // The cookie should be sent automatically by the browser
      window.location.replace(data.redirect || '/')

    } catch (err: any) {
      console.error('[CLIENT] Login error:', err)
      // Handle network errors (status 0) vs actual login errors
      let errorMessage = 'Login failed. Please check your credentials.'
      if (err.message && (err.message.includes('status 0') || err.message.includes('Network error'))) {
        errorMessage = 'Network error - unable to connect to server. Please make sure the dev server is running (npm run dev).'
      } else if (err.message) {
        errorMessage = err.message
      }
      setError(errorMessage)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" style={{ backgroundColor: '#FAFAFA', minHeight: '100vh' }}>
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border/50 bg-card p-8 shadow-sm">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Alain Business Center</h2>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm animate-fade-in">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="Enter your email"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password) {
                    e.currentTarget.form?.requestSubmit()
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (email && password) {
                      handleSubmit(e as any)
                    }
                  }
                }}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-medium tracking-normal text-white bg-primary hover:bg-primary/90 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


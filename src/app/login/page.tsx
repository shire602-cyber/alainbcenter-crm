'use client'

import { useState, FormEvent, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left Column - Gradient Background */}
      <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-indigo-500 to-violet-600 p-12 text-white relative overflow-hidden">
        <div className={`max-w-md space-y-6 ${mounted ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Turn conversations into customers.
          </h1>
          <p className="text-lg md:text-xl text-indigo-100 leading-relaxed">
            AI-powered WhatsApp CRM for modern businesses.
          </p>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex items-center justify-center p-4 md:p-8 bg-background">
        <div className={`w-full max-w-md ${mounted ? 'animate-fade-in-up' : 'opacity-0'}`} style={{ animationDelay: '100ms' }}>
          <div className="rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
            {/* Logo */}
            <div className="flex justify-center mb-8">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 overflow-hidden flex-shrink-0 px-4 py-2 shadow-md transition-all duration-200 group-hover:shadow-lg group-hover:scale-[1.02]">
                  <img 
                    src="/implse-ai-icon.svg" 
                    alt="IMPLSE AI" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement
                      target.style.display = 'none'
                      const parent = target.parentElement
                      if (parent && !parent.querySelector('.logo-fallback')) {
                        const fallback = document.createElement('div')
                        fallback.className = 'logo-fallback'
                        fallback.innerHTML = '<svg class="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>'
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground">IMPLSE AI</h2>
                  <p className="text-xs text-muted-foreground">AI Business CRM</p>
                </div>
              </Link>
            </div>

            <div className="space-y-1 mb-8 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">Welcome back</h2>
              <p className="text-sm text-muted-foreground">Sign in to your account</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
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
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
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
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
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
                  className="w-full flex justify-center py-2.5 px-4 rounded-lg shadow-sm text-sm font-medium tracking-normal text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
      `}</style>
    </div>
  )
}


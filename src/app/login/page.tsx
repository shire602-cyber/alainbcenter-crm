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
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Left Column - Branding Panel */}
      <div className="hidden md:flex flex-col justify-center items-center p-12 text-slate-900 relative overflow-hidden">
        {/* Sophisticated geometric pattern background */}
        <div className="absolute inset-0 opacity-[0.03]">
          <div className="absolute inset-0" style={{
            backgroundImage: `linear-gradient(to right, #1e293b 1px, transparent 1px),
                              linear-gradient(to bottom, #1e293b 1px, transparent 1px)`,
            backgroundSize: '48px 48px'
          }}></div>
        </div>
        
        {/* Subtle geometric shapes */}
        <div className="absolute top-20 right-20 w-32 h-32 border border-slate-300/30 rotate-45"></div>
        <div className="absolute bottom-32 left-16 w-24 h-24 border border-slate-300/20 rotate-12"></div>
        <div className="absolute top-1/2 right-1/4 w-16 h-16 border border-slate-300/25 rotate-45"></div>
        
        <div className={`max-w-md space-y-8 relative z-10 ${mounted ? 'animate-premium-fade-in' : 'opacity-0'}`}>
          <h1 className="text-hero text-slate-900">
            Turn conversations<br />into customers.
          </h1>
          <p className="text-lg md:text-xl text-slate-600 leading-relaxed font-medium">
            AI-powered WhatsApp CRM for modern businesses.
          </p>
        </div>
      </div>

      {/* Right Column - Login Form */}
      <div className="flex items-center justify-center p-4 md:p-12">
        <div className={`w-full max-w-lg ${mounted ? 'animate-premium-fade-in' : 'opacity-0'}`} style={{ animationDelay: '150ms' }}>
          <div className="rounded-2xl border border-slate-200/60 bg-white/80 backdrop-blur-sm p-10 md:p-12 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)]">
            {/* Logo */}
            <div className="flex justify-center mb-10">
              <Link href="/" className="flex items-center gap-4 group">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 px-3 py-3 shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:scale-[1.03]">
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
                        fallback.innerHTML = '<svg class="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>'
                        parent.appendChild(fallback)
                      }
                    }}
                  />
                </div>
                <div>
                  <h2 className="text-headline text-slate-900">IMPLSE AI</h2>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">AI Business CRM</p>
                </div>
              </Link>
            </div>

            <div className="space-y-2 mb-10 text-center">
              <h2 className="text-display text-slate-900">Welcome back</h2>
              <p className="text-sm text-slate-600">Sign in to your account</p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="bg-red-50 border border-red-200/60 text-red-700 px-4 py-3.5 rounded-lg text-sm font-medium shadow-sm animate-premium-fade-in">
                  {error}
                </div>
              )}
              
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <label htmlFor="email" className="block text-body font-semibold text-slate-900">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="Enter your email"
                    className="flex h-12 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 focus:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 transition-all duration-300"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && password) {
                        e.currentTarget.form?.requestSubmit()
                      }
                    }}
                  />
                </div>
                
                <div className="space-y-2.5">
                  <label htmlFor="password" className="block text-body font-semibold text-slate-900">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    className="flex h-12 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 focus:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-slate-50 transition-all duration-300"
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

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center h-12 px-4 rounded-lg shadow-lg text-body font-semibold tracking-normal text-white bg-slate-900 hover:bg-slate-800 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-slate-200 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900 transition-all duration-300"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing in...
                    </span>
                  ) : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes premium-fade-in {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-premium-fade-in {
          animation: premium-fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  )
}


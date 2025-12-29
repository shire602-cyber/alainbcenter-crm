'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function TestLoginPage() {
  const router = useRouter()
  
  // D) LOCK DOWN: Only available in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      router.push('/login')
    }
  }, [router])
  
  // Don't render in production
  if (process.env.NODE_ENV === 'production') {
    return null
  }
  const [result, setResult] = useState<any>(null)
  const [cookieCheck, setCookieCheck] = useState<any>(null)

  async function testLogin() {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@alainbcenter.com', password: 'admin123' }),
        credentials: 'include',
      })
      
      const data = await res.json()
      const setCookieHeader = res.headers.get('set-cookie')
      
      setResult({
        status: res.status,
        data,
        setCookieHeader,
        allHeaders: Object.fromEntries(res.headers.entries()),
      })
    } catch (err: any) {
      setResult({ error: err.message })
    }
  }

  async function checkCookie() {
    try {
      const res = await fetch('/api/debug-cookie', {
        credentials: 'include',
      })
      const data = await res.json()
      setCookieCheck(data)
    } catch (err: any) {
      setCookieCheck({ error: err.message })
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Login Test Page</h1>
      
      <div className="space-y-4">
        <div>
          <button
            onClick={testLogin}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Test Login API
          </button>
        </div>

        {result && (
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold mb-2">Login API Result:</h2>
            <pre className="text-xs overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}

        <div>
          <button
            onClick={checkCookie}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Check Cookie Status
          </button>
        </div>

        {cookieCheck && (
          <div className="bg-gray-100 p-4 rounded">
            <h2 className="font-bold mb-2">Cookie Status:</h2>
            <pre className="text-xs overflow-auto">{JSON.stringify(cookieCheck, null, 2)}</pre>
          </div>
        )}

        <div className="bg-yellow-100 p-4 rounded">
          <p className="font-bold mb-2">Browser Cookies (client-side):</p>
          <p className="text-xs">{typeof document !== 'undefined' ? document.cookie : '(no cookies visible - httpOnly cookies are hidden)'}</p>
        </div>
      </div>
    </div>
  )
}


import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import "./globals.css"
import { Providers } from "./providers"
import { createSkipToContentLink } from '@/lib/accessibility'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} light`} style={{ colorScheme: 'light' }}>
      <head>
        <title>IMPLSE AI - AI-Powered CRM</title>
        <meta name="description" content="AI-powered CRM for business setup and visa services. Automate conversations, recover revenue, scale your business." />
        <link rel="icon" href="/implse-ai-icon.svg" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased text-body text-foreground bg-app min-h-screen">
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg"
          style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', borderWidth: 0 }}
        >
          Skip to main content
        </a>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

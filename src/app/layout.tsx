import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import "./globals.css"
import { Providers } from "./providers"

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
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <head>
        <title>IMPLSE AI - AI-Powered CRM</title>
        <meta name="description" content="AI-powered CRM for business setup and visa services. Automate conversations, recover revenue, scale your business." />
        <link rel="icon" href="/implse-ai-icon.svg" type="image/svg+xml" />
      </head>
      <body suppressHydrationWarning className="font-sans antialiased text-body text-foreground bg-app min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

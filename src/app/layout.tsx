import { ReactNode } from 'react'
import { Inter } from 'next/font/google'
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '450', '500', '600', '650'],
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
        <title>Alain Business Center CRM</title>
        <meta name="description" content="Premium CRM for business setup and visa services" />
      </head>
      <body suppressHydrationWarning className="font-sans antialiased text-body text-foreground bg-app min-h-screen">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

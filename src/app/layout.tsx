import { ReactNode } from 'react'
import "./globals.css"
import { Providers } from "./providers"

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning style={{ backgroundColor: '#FAFAFA' }}>
      <head>
        <title>Alain Business Center CRM</title>
        <meta name="description" content="Premium CRM for business setup and visa services" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning className="font-sans antialiased text-sm text-foreground bg-background min-h-screen" style={{ backgroundColor: '#FAFAFA', color: '#1B1F24' }}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

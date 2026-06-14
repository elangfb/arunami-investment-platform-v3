import type { Metadata } from 'next'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

// Mizan type system (Refined Navy): IBM Plex Sans for UI/headings, IBM Plex Mono
// for IDs/currency (tabular figures). Bound to --font-sans / --font-mono, the
// @theme tokens referenced app-wide.
const plexSans = IBM_Plex_Sans({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})
const plexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'MIZAN — Financing Origination System',
  description: 'PT BPRS Hijra Alami — Sistem Originasi Pembiayaan',
  // Favicon uses the Next App Router file convention: app/icon.svg is auto-detected
  // and its <link rel="icon"> injected. No manual config. icon.svg shares the exact
  // Helium-spec geometry with the <MizanIcon> component (full-bleed, rx8.4, octagram 14.3).
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased font-sans`}>
        <NuqsAdapter>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}

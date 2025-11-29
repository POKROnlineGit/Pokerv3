import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { createServerComponentClient } from '@/lib/supabaseClient'
import { redirect } from 'next/navigation'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'PokerOnline - Learn & Play Texas Hold\'em',
  description: 'Play and learn No-Limit Texas Hold\'em poker for free',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Get user theme preference
  let theme = 'light'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('theme')
      .eq('id', user.id)
      .single()
    if (profile?.theme) {
      theme = profile.theme
    }
  }

  return (
    <html lang="en" className={theme}>
      <body className={inter.className}>
        {user ? (
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </body>
    </html>
  )
}


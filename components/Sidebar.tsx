'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Play, BookOpen, Settings, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navItems = [
    { href: '/play', label: 'Play Poker', icon: Play },
    { href: '/learn', label: 'Learn', icon: BookOpen },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]

  return (
    <div className="flex flex-col h-screen w-64 border-r bg-card">
      <div className="p-6 border-b">
        <Link href="/play" className="text-2xl font-bold text-primary">
          PokerOnline
        </Link>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  )
}


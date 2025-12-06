'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Play, BookOpen, Settings, LogOut, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [pendingCount, setPendingCount] = useState(0)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
      }
    })
  }, [supabase])

  useEffect(() => {
    if (!user) return

    // Fetch initial pending count
    supabase
      .from('friend_requests')
      .select('id', { count: 'exact', head: true })
      .eq('to_user_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => {
        setPendingCount(count || 0)
      })

    // Subscribe to realtime updates
    const channel = supabase
      .channel('friend_requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${user.id}`,
        },
        (payload) => {
          // Refetch count on any change
          supabase
            .from('friend_requests')
            .select('id', { count: 'exact', head: true })
            .eq('to_user_id', user.id)
            .eq('status', 'pending')
            .then(({ count }) => {
              setPendingCount(count || 0)
            })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    // Redirect to coming-soon and force a hard refresh to clear any cached state
    window.location.href = '/coming-soon'
  }

  const navItems = [
    { href: '/play', label: 'Play Poker', icon: Play },
    { href: '/learn', label: 'Learn', icon: BookOpen },
    { href: '/friends', label: 'Friends', icon: Users, badge: pendingCount > 0 ? pendingCount : null },
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
                "flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <Badge variant="destructive" className="ml-auto">
                  {item.badge}
                </Badge>
              )}
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


'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, UserPlus, Check, X, Users, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/providers/ThemeProvider'

interface Friend {
  id: string
  username: string
  friend_id: string
}

interface FriendRequest {
  id: string
  from_user_id: string
  to_user_id: string
  status: string
  created_at: string
  from_user?: {
    username: string
  }
}

export default function FriendsPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { currentTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [friends, setFriends] = useState<Friend[]>([])
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([])
  const [searchUsername, setSearchUsername] = useState('')
  const [searchResult, setSearchResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0]
  const gradientColors = currentTheme.colors.gradient
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1]
  const accentColor = currentTheme.colors.accent[0]

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
      }
    })
  }, [supabase])

  // Fetch friends
  const fetchFriends = async () => {
    if (!user) return

    // Get all friendships where user is involved
    const { data, error } = await supabase
      .from('friends')
      .select('user_id, friend_id')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

    if (error) {
      return
    }

    // Get unique friend IDs (the other user in each relationship)
    const friendIds = new Set<string>()
    data?.forEach((item) => {
      if (item.user_id === user.id) {
        friendIds.add(item.friend_id)
      } else {
        friendIds.add(item.user_id)
      }
    })

    // Fetch profiles for all friends
    if (friendIds.size > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', Array.from(friendIds))

      if (profileError) {
        return
      }

      const friendsList: Friend[] = (profiles || []).map((profile) => ({
        id: profile.id,
        username: profile.username,
        friend_id: profile.id,
      }))

      setFriends(friendsList)
    } else {
      setFriends([])
    }
  }

  // Fetch pending requests
  const fetchPendingRequests = async () => {
    if (!user) return

    // First get the friend requests
    const { data: requestsData, error } = await supabase
      .from('friend_requests')
      .select('id, from_user_id, to_user_id, status, created_at')
      .eq('to_user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      return
    }

    if (!requestsData || requestsData.length === 0) {
      setPendingRequests([])
      return
    }

    // Then fetch usernames for each from_user_id
    const fromUserIds = requestsData.map((r) => r.from_user_id)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', fromUserIds)

    if (profilesError) {
      // Silently handle error
    }

    // Map requests with usernames
    const requests = requestsData.map((item) => {
      const profile = profiles?.find((p) => p.id === item.from_user_id)
      return {
        id: item.id,
        from_user_id: item.from_user_id,
        to_user_id: item.to_user_id,
        status: item.status,
        created_at: item.created_at,
        from_user: profile ? { username: profile.username } : undefined,
      }
    })

    setPendingRequests(requests)
  }

  useEffect(() => {
    if (user) {
      fetchFriends()
      fetchPendingRequests()
    }
  }, [user])

  // Realtime subscription for friend requests
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('friend_requests_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${user.id}`,
        },
        (payload) => {
          const newRequest = payload.new as FriendRequest
          if (newRequest.status === 'pending') {
            fetchPendingRequests()
            // Fetch username for toast
            supabase
              .from('profiles')
              .select('username')
              .eq('id', newRequest.from_user_id)
              .single()
              .then(({ data }) => {
                if (data) {
                  toast({
                    title: 'New Friend Request',
                    description: `${data.username} sent you a friend request`,
                  })
                }
              })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${user.id}`,
        },
        () => {
          fetchPendingRequests()
          fetchFriends()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friends',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchFriends()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase, toast])

  const handleSearch = async () => {
    const trimmedUsername = searchUsername.trim()
    if (!trimmedUsername) {
      setSearchResult(null)
      return
    }

    setLoading(true)
    setSearchResult(null) // Clear previous result
    
    try {
      const response = await fetch(`/api/friends/search?username=${encodeURIComponent(trimmedUsername)}`)
      const data = await response.json()

      if (response.ok && data && data.id) {
        setSearchResult(data)
      } else {
        setSearchResult(null)
        toast({
          title: 'User not found',
          description: data.error || 'Could not find user with that username',
          variant: 'destructive',
        })
      }
    } catch (error) {
      setSearchResult(null)
      toast({
        title: 'Error',
        description: 'Failed to search for user. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSendRequest = async (friendId: string) => {
    try {
      const response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: 'Request sent',
          description: 'Friend request sent successfully',
        })
        setSearchResult(null)
        setSearchUsername('')
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to send request',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send friend request',
        variant: 'destructive',
      })
    }
  }

  const handleRespond = async (requestId: string, accept: boolean) => {
    try {
      const response = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, accept }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: accept ? 'Request accepted' : 'Request rejected',
          description: accept
            ? 'You are now friends!'
            : 'Friend request rejected',
        })
        fetchPendingRequests()
        fetchFriends()
      } else {
        toast({
          title: 'Error',
          description: data.error || 'Failed to process request',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process friend request',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-6">Friends</h1>

        {/* Search Bar */}
        <Card className="mb-6 bg-card">
        <CardHeader>
          <CardTitle>Add Friend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Search by username..."
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch()
                }
              }}
            />
            <Button 
              onClick={handleSearch} 
              disabled={loading}
              style={{
                backgroundColor: accentColor,
                color: 'white',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || accentColor
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = accentColor
                }
              }}
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>

          {searchResult && (
            <div className="mt-4 p-4 border rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">{searchResult.username}</span>
              </div>
              <Button
                size="sm"
                onClick={() => handleSendRequest(searchResult.id)}
                style={{
                  backgroundColor: accentColor,
                  color: 'white',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || accentColor
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = accentColor
                }}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Friend
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="friends" className="w-full">
        <TabsList>
          <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending Requests
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {pendingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Your Friends</CardTitle>
            </CardHeader>
            <CardContent>
              {friends.length === 0 ? (
                <p className="text-muted-foreground">No friends yet. Search for users to add friends!</p>
              ) : (
                <div className="space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{friend.username}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/friends/profile/${friend.id}`)}
                        style={{
                          borderColor: accentColor,
                          color: accentColor,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = accentColor
                          e.currentTarget.style.color = 'white'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                          e.currentTarget.style.color = accentColor
                        }}
                      >
                        <User className="h-4 w-4 mr-2" />
                        View Profile
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Pending Friend Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRequests.length === 0 ? (
                <p className="text-muted-foreground">No pending requests</p>
              ) : (
                <div className="space-y-2">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">
                          {request.from_user?.username || 'Unknown User'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleRespond(request.id, true)}
                          style={{
                            backgroundColor: accentColor,
                            color: 'white',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = currentTheme.colors.accent[1] || accentColor
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = accentColor
                          }}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRespond(request.id, false)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>
      </div>
    </div>
  )
}


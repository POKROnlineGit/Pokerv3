import { redirect } from 'next/navigation'

interface FriendProfileRedirectProps {
  params: Promise<{ friendId: string }>
}

// Backwards compatibility redirect
export default async function FriendProfileRedirect({ params }: FriendProfileRedirectProps) {
  const { friendId } = await params
  redirect(`/social/friends/profile/${friendId}`)
}

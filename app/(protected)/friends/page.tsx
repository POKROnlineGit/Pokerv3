import { redirect } from 'next/navigation'

// Backwards compatibility redirect
export default function FriendsRedirect() {
  redirect('/social/friends')
}

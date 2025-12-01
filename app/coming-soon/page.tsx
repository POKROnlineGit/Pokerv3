'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

// Card suits and ranks for floating cards
const CARD_SUITS = ['h', 'd', 'c', 's']
const CARD_RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7']

// Generate 8 unique cards
const generateCards = () => {
  const cards: string[] = []
  while (cards.length < 8) {
    const suit = CARD_SUITS[Math.floor(Math.random() * CARD_SUITS.length)]
    const rank = CARD_RANKS[Math.floor(Math.random() * CARD_RANKS.length)]
    const card = `${rank}${suit}`
    if (!cards.includes(card)) {
      cards.push(card)
    }
  }
  return cards
}

function FloatingCard({ card, index }: { card: string; index: number }) {
  const positions = [
    { x: 10, y: 15 },
    { x: 25, y: 10 },
    { x: 40, y: 20 },
    { x: 60, y: 15 },
    { x: 75, y: 25 },
    { x: 85, y: 40 },
    { x: 70, y: 60 },
    { x: 50, y: 70 },
    { x: 30, y: 65 },
  ]

  const pos = positions[index % positions.length]

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
      }}
      initial={{ 
        y: 100, 
        opacity: 0, 
        rotate: -180,
        scale: 0.5 
      }}
      animate={{ 
        y: [0, -30, 0],
        opacity: [0, 0.3, 0.2],
        rotate: [0, 15, -15, 0],
        scale: [0.5, 1, 0.9],
      }}
      transition={{ 
        y: {
          duration: 4 + index * 0.3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: index * 0.2,
        },
        opacity: {
          duration: 2,
          delay: index * 0.2,
        },
        rotate: {
          duration: 6 + index * 0.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: index * 0.2,
        },
        scale: {
          duration: 3,
          delay: index * 0.2,
        }
      }}
    >
      <Image
        src={`/cards/${card}.png`}
        alt={card}
        width={120}
        height={168}
        className="drop-shadow-2xl opacity-80"
      />
    </motion.div>
  )
}

export default function ComingSoonPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(false)
  const [cards] = useState(() => generateCards())

  // Check for access denied message
  const denied = searchParams.get('denied')

  useEffect(() => {
    if (denied) {
      // Show toast notification
      const toast = document.createElement('div')
      toast.className = 'fixed top-4 right-4 bg-destructive text-destructive-foreground px-6 py-3 rounded-lg shadow-lg z-50 animate-in slide-in-from-top-5'
      toast.textContent = 'Access denied. Super user only.'
      document.body.appendChild(toast)
      
      setTimeout(() => {
        toast.classList.add('animate-out', 'slide-out-to-top-5')
        setTimeout(() => toast.remove(), 300)
      }, 3000)
    }
  }, [denied])

  const handleDeveloperLogin = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error
    } catch (err: any) {
      console.error('Login error:', err)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 relative overflow-hidden">
      {/* Floating cards background */}
      {cards.map((card, index) => (
        <FloatingCard key={`${card}-${index}`} card={card} index={index} />
      ))}

      {/* Main content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4 py-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Hero text */}
          <motion.h1
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="text-7xl md:text-9xl font-bold text-white mb-6 drop-shadow-2xl"
            style={{
              textShadow: '0 0 40px rgba(154, 31, 64, 0.8), 0 0 80px rgba(154, 31, 64, 0.5), 0 0 120px rgba(154, 31, 64, 0.3)',
            }}
          >
            PokerOnline
          </motion.h1>

          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.2 }}
            className="text-3xl md:text-4xl text-green-100 mb-4 font-medium"
          >
            Coming Soon
          </motion.div>

          <motion.p
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.4 }}
            className="text-xl md:text-2xl text-green-200 mb-12 font-light"
          >
            The ultimate free Texas Hold&apos;em platform
          </motion.p>

          {/* Developer Login Button */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.6 }}
          >
            <Button
              onClick={handleDeveloperLogin}
              disabled={loading}
              className="bg-[#9A1F40] hover:bg-[#7A1A30] text-white px-8 py-6 text-lg font-semibold rounded-xl shadow-2xl transition-all duration-300"
              style={{
                boxShadow: '0 10px 40px rgba(154, 31, 64, 0.4), 0 0 20px rgba(154, 31, 64, 0.2)',
              }}
            >
              {loading ? 'Signing in...' : 'Developer Login'}
            </Button>
          </motion.div>

          {/* Subtle chip particles animation */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-3 bg-yellow-400/30 rounded-full"
                style={{
                  left: `${20 + i * 15}%`,
                  top: `${30 + (i % 2) * 40}%`,
                }}
                animate={{
                  y: [0, -20, 0],
                  opacity: [0.3, 0.6, 0.3],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 3 + i * 0.5,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}


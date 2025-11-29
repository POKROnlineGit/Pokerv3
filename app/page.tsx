'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Play, BookOpen, TrendingUp, Zap, Users, Target } from 'lucide-react'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import Image from 'next/image'
import { useEffect, useState } from 'react'

// Floating card component for background
function FloatingCard({ card, index, delay }: { card: string; index: number; delay: number }) {
  return (
    <motion.div
      className="absolute opacity-10 pointer-events-none"
      style={{
        left: `${(index * 15) % 100}%`,
        top: `${(index * 20) % 100}%`,
      }}
      initial={{ y: 100, opacity: 0, rotate: -180 }}
      animate={{ 
        y: [0, -20, 0],
        opacity: 0.15, 
        rotate: [0, 5, -5, 0],
      }}
      transition={{ 
        opacity: { duration: 1.5, delay: delay },
        y: {
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay,
        },
        rotate: {
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
          delay: delay,
        }
      }}
    >
      <Image
        src={`/cards/${card}.png`}
        alt={card}
        width={120}
        height={168}
        className="drop-shadow-2xl"
      />
    </motion.div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [loading, setLoading] = useState(false)

  // Check if user is already logged in and redirect
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/play')
      }
    }
    checkUser()
  }, [router, supabase])

  const handleGoogleSignIn = async () => {
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
      console.error('Sign in error:', err)
      setLoading(false)
    }
  }

  const handlePlayNow = () => {
    router.push('/auth/signin')
  }

  // Cards for floating background
  const floatingCards = ['Ah', 'Kd', 'Qc', 'Js', 'Th', '9s', '8h']

  // Seat positions for showcase table
  const seatPositions = [
    { top: '5%', left: '50%', transform: 'translateX(-50%)' },
    { top: '18%', right: '5%', transform: 'translateX(50%)' },
    { top: '50%', right: '2%', transform: 'translateX(50%)' },
    { top: '82%', right: '5%', transform: 'translateX(50%)' },
    { top: '95%', left: '50%', transform: 'translateX(-50%)' },
    { top: '18%', left: '5%', transform: 'translateX(-50%)' },
  ]

  const showcaseCards = ['Ah', 'Kd', 'Qc', 'Js', 'Th', '9s']

  return (
    <div className="min-h-screen bg-poker-felt overflow-x-hidden">
      {/* Theme Toggle */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20">
        {/* Floating background cards */}
        {floatingCards.map((card, index) => (
          <FloatingCard key={card} card={card} index={index} delay={index * 0.2} />
        ))}

        <div className="relative z-10 text-center max-w-5xl mx-auto">
          <motion.h1
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
            className="text-7xl md:text-9xl font-bold text-white mb-6 drop-shadow-2xl"
            style={{
              textShadow: '0 0 40px rgba(154, 31, 64, 0.8), 0 0 80px rgba(154, 31, 64, 0.5)',
            }}
          >
            PokerOnline
          </motion.h1>

          <motion.p
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.2 }}
            className="text-2xl md:text-3xl text-green-100 mb-12 font-medium"
          >
            Master Texas Hold'em – Play Free, Learn Fast, Win Big
          </motion.p>

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handlePlayNow}
                size="lg"
                className="bg-primary-500 hover:bg-primary-600 text-white text-lg px-8 py-6 rounded-2xl shadow-xl"
              >
                <Play className="mr-2 h-5 w-5" />
                Play Now
              </Button>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handleGoogleSignIn}
                disabled={loading}
                variant="outline"
                size="lg"
                className="bg-white/10 border-2 border-white/30 text-white hover:bg-white/20 text-lg px-8 py-6 rounded-2xl shadow-xl backdrop-blur-sm"
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign In with Google
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-green-900/50 to-green-800/50">
        <div className="container mx-auto max-w-6xl">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold text-center text-white mb-16"
          >
            Why Players Love PokerOnline
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              whileHover={{ y: -12, scale: 1.05 }}
              initial={{ y: 80, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <Card className="bg-card/90 backdrop-blur-sm border-2 border-primary-500/20 rounded-2xl shadow-xl h-full">
                <CardHeader>
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className="mb-4"
                  >
                    <Zap className="h-16 w-16 text-primary-500 mx-auto" />
                  </motion.div>
                  <CardTitle className="text-2xl text-center mb-4">Play Instantly</CardTitle>
                  <p className="text-muted-foreground text-center">
                    Jump into real-time 6-max games or practice against intelligent bots. No waiting, no queues—just pure poker action.
                  </p>
                </CardHeader>
              </Card>
            </motion.div>

            <motion.div
              whileHover={{ y: -12, scale: 1.05 }}
              initial={{ y: 80, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
            >
              <Card className="bg-card/90 backdrop-blur-sm border-2 border-primary-500/20 rounded-2xl shadow-xl h-full">
                <CardHeader>
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className="mb-4"
                  >
                    <BookOpen className="h-16 w-16 text-primary-500 mx-auto" />
                  </motion.div>
                  <CardTitle className="text-2xl text-center mb-4">Learn from Pros</CardTitle>
                  <p className="text-muted-foreground text-center">
                    Interactive lessons covering preflop strategy, postflop play, and advanced concepts. Master the fundamentals step by step.
                  </p>
                </CardHeader>
              </Card>
            </motion.div>

            <motion.div
              whileHover={{ y: -12, scale: 1.05 }}
              initial={{ y: 80, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.2 }}
            >
              <Card className="bg-card/90 backdrop-blur-sm border-2 border-primary-500/20 rounded-2xl shadow-xl h-full">
                <CardHeader>
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                    className="mb-4"
                  >
                    <TrendingUp className="h-16 w-16 text-primary-500 mx-auto" />
                  </motion.div>
                  <CardTitle className="text-2xl text-center mb-4">Track Your Progress</CardTitle>
                  <p className="text-muted-foreground text-center">
                    Monitor your chip stack, lesson completion, and improvement over time. Watch yourself become a better player.
                  </p>
                </CardHeader>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Animated Cards Showcase */}
      <section className="relative py-24 px-4 bg-poker-felt">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            {/* Poker Table */}
            <div className="relative w-full max-w-4xl mx-auto aspect-[4/3]">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-800 to-green-900 border-8 border-amber-800 shadow-2xl">
                {/* Felt texture overlay */}
                <div className="absolute inset-0 rounded-full bg-green-700/20" />

                {/* Community cards area */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex gap-2 z-10">
                  {['As', 'Kd', 'Qh'].map((card, i) => (
                    <motion.div
                      key={card}
                      initial={{ x: -800, y: 200, rotate: -360, opacity: 0 }}
                      whileInView={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                        delay: i * 0.12 + 0.5,
                      }}
                      layout
                    >
                      <div className="bg-white rounded-lg p-1 shadow-lg">
                        <Image
                          src={`/cards/${card}.png`}
                          alt={card}
                          width={80}
                          height={112}
                          className="rounded-md"
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Pot display */}
                <motion.div
                  initial={{ scale: 0, y: 100 }}
                  whileInView={{ scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 500, damping: 20, delay: 1 }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[120%] bg-black/80 text-white px-6 py-3 rounded-xl shadow-xl"
                >
                  <div className="text-sm text-muted-foreground">Pot</div>
                  <div className="text-3xl font-bold">1,250</div>
                </motion.div>

                {/* Player Seats with Cards */}
                {seatPositions.map((position, index) => (
                  <motion.div
                    key={index}
                    className="absolute flex flex-col items-center"
                    style={position}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                  >
                    <div className="bg-gray-800/70 text-white text-xs px-3 py-1 rounded-md mb-2">
                      Player {index + 1}
                    </div>
                    <div className="flex gap-1">
                      {[0, 1].map((cardIndex) => (
                        <motion.div
                          key={cardIndex}
                          initial={{ x: -800, y: 200, rotate: -360, opacity: 0 }}
                          whileInView={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                            delay: 0.8 + index * 0.12 + cardIndex * 0.06,
                          }}
                          layout
                        >
                          <div className="bg-white rounded-lg p-0.5 shadow-lg">
                            <Image
                              src={`/cards/${showcaseCards[index] || 'back'}.png`}
                              alt="card"
                              width={60}
                              height={84}
                              className="rounded-md"
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Text Overlay */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 1.5 }}
              className="text-center mt-12"
            >
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Real-time 6-max No-Limit Hold'em
              </h3>
              <p className="text-xl text-green-100">
                Experience authentic poker gameplay with smooth animations and instant updates
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* How It Works Timeline */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-green-800/50 to-green-900/50">
        <div className="container mx-auto max-w-4xl">
          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl font-bold text-center text-white mb-16"
          >
            How It Works
          </motion.h2>

          <div className="space-y-12">
            {[
              {
                step: 1,
                title: 'Sign Up in Seconds',
                description: 'Create your account with Google or email. Get 10,000 free chips to start playing immediately.',
                icon: Users,
              },
              {
                step: 2,
                title: 'Jump Into a Game',
                description: 'Join a real-time 6-max table or practice against intelligent bots. No waiting, instant action.',
                icon: Play,
              },
              {
                step: 3,
                title: 'Improve with Lessons',
                description: 'Master poker fundamentals through interactive lessons. Track your progress and become a better player.',
                icon: Target,
              },
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: index % 2 === 0 ? -100 : 100 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 200, damping: 25, delay: index * 0.2 }}
                className="flex gap-6 items-start"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 360 }}
                  transition={{ duration: 0.5 }}
                  className="flex-shrink-0 w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center shadow-xl"
                >
                  <item.icon className="h-8 w-8 text-white" />
                </motion.div>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-lg text-green-100">{item.description}</p>
                </div>
                <div className="text-6xl font-bold text-primary-500/30">{item.step}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 px-4 bg-gradient-to-b from-green-900 to-green-950">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 100, damping: 15 }}
          >
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Ready to Play Poker Like a Pro?
            </h2>
            <p className="text-2xl text-green-100 mb-12">
              Join thousands of players mastering Texas Hold'em
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                onClick={handlePlayNow}
                size="lg"
                className="bg-primary-500 hover:bg-primary-600 text-white text-xl px-12 py-8 rounded-2xl shadow-2xl"
              >
                <Play className="mr-3 h-6 w-6" />
                Start Playing Free
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

'use client'

import { LessonCard } from '@/components/LessonCard'
import { createClientComponentClient } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

const LESSONS = [
  { id: 1, title: 'Preflop Basics', description: 'Learn the fundamentals of preflop play, starting hand selection, and position.' },
  { id: 2, title: 'Continuation Betting', description: 'Master the art of continuation betting and when to apply pressure on the flop.' },
  { id: 3, title: 'Pot Odds & Equity', description: 'Understand pot odds, implied odds, and how to calculate your equity in hands.' },
  { id: 4, title: 'Bluffing & Semi-Bluffing', description: 'Learn when and how to bluff effectively, including semi-bluffing strategies.' },
  { id: 5, title: 'Reading Opponents', description: 'Develop skills to read your opponents and identify betting patterns.' },
  { id: 6, title: 'Bankroll Management', description: 'Learn proper bankroll management to sustain long-term success.' },
]

export default function LearnPage() {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const { currentTheme } = useTheme()
  const [progressMap, setProgressMap] = useState<Map<number, { completed?: boolean; progress?: number }>>(new Map())
  const [loading, setLoading] = useState(true)

  // Get theme colors
  const primaryColor = currentTheme.colors.primary[0]
  const gradientColors = currentTheme.colors.gradient
  const centerColor = currentTheme.colors.primary[2] || currentTheme.colors.primary[1]

  useEffect(() => {
    const loadProgress = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data: progress } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed, progress_percent')
        .eq('user_id', user.id)

      setProgressMap(new Map(
        progress?.map(p => [p.lesson_id, { completed: p.completed, progress: p.progress_percent }]) || []
      ))
      setLoading(false)
    }
    loadProgress()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-black relative">
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-screen">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black relative">
      {/* --- SCROLLABLE CONTENT LAYER --- */}
      <div className="relative z-10">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold mb-8">Learn Poker</h1>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {LESSONS.map((lesson) => {
              const userProgress = progressMap.get(lesson.id)
              return (
                <LessonCard
                  key={lesson.id}
                  id={lesson.id}
                  title={lesson.title}
                  description={lesson.description}
                  completed={userProgress?.completed}
                  progress={userProgress?.progress}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}


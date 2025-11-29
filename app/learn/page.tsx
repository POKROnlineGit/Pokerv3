import { LessonCard } from '@/components/LessonCard'
import { createServerComponentClient } from '@/lib/supabaseClient'
import { redirect } from 'next/navigation'

const LESSONS = [
  { id: 1, title: 'Preflop Basics', description: 'Learn the fundamentals of preflop play, starting hand selection, and position.' },
  { id: 2, title: 'Continuation Betting', description: 'Master the art of continuation betting and when to apply pressure on the flop.' },
  { id: 3, title: 'Pot Odds & Equity', description: 'Understand pot odds, implied odds, and how to calculate your equity in hands.' },
  { id: 4, title: 'Bluffing & Semi-Bluffing', description: 'Learn when and how to bluff effectively, including semi-bluffing strategies.' },
  { id: 5, title: 'Reading Opponents', description: 'Develop skills to read your opponents and identify betting patterns.' },
  { id: 6, title: 'Bankroll Management', description: 'Learn proper bankroll management to sustain long-term success.' },
]

export default async function LearnPage() {
  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Get progress for each lesson
  const { data: progress } = await supabase
    .from('lesson_progress')
    .select('lesson_id, completed, progress_percent')
    .eq('user_id', user.id)

  const progressMap = new Map(
    progress?.map(p => [p.lesson_id, { completed: p.completed, progress: p.progress_percent }]) || []
  )

  return (
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
  )
}


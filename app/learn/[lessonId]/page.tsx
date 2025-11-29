import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createServerComponentClient } from '@/lib/supabaseClient'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

const LESSONS: Record<number, { title: string; content: string }> = {
  1: {
    title: 'Preflop Basics',
    content: `# Preflop Basics

## Starting Hand Selection

The foundation of winning poker starts with selecting the right hands to play preflop. Not all hands are created equal, and position matters significantly.

### Premium Hands
- **Pocket Pairs (AA, KK, QQ, JJ)**: These are the strongest starting hands. Raise or re-raise with these.
- **Big Cards (AK, AQ, KQ)**: Strong drawing hands that can make top pair or better.

### Position Matters
- **Early Position**: Play tight - only premium hands
- **Middle Position**: Slightly wider range
- **Late Position (Button)**: Can play more hands, especially suited connectors

### Key Concepts
1. **Tight is Right**: In early position, fold most hands
2. **Position Power**: Later positions allow you to see what others do first
3. **Stack Sizes**: Adjust your range based on effective stack sizes

Remember: It's better to fold a marginal hand than to play it out of position.`,
  },
  2: {
    title: 'Continuation Betting',
    content: `# Continuation Betting

## What is a C-Bet?

A continuation bet (C-bet) is a bet made on the flop by the player who raised preflop, regardless of whether they hit the flop.

### When to C-Bet
- **You raised preflop**: Maintain your aggressive image
- **Dry boards**: Boards like A-7-2 rainbow are good for C-betting
- **You have equity**: Even if you missed, you might have draws

### When NOT to C-Bet
- **Wet boards**: Boards with many draws (like 9-8-7) are dangerous
- **Multiple opponents**: Harder to win with a bluff
- **You're out of position**: More expensive to bet and get called

### C-Bet Sizing
- **Small C-bet (1/3 pot)**: On dry boards, smaller bets can work
- **Standard C-bet (1/2 pot)**: Most common sizing
- **Large C-bet (2/3 pot)**: When you want to build a big pot with strong hands`,
  },
  3: {
    title: 'Pot Odds & Equity',
    content: `# Pot Odds & Equity

## Understanding Pot Odds

Pot odds tell you whether a call is profitable based on the current pot size and the cost of your call.

### Calculating Pot Odds
If the pot is $100 and you need to call $20:
- Pot odds = 20 / (100 + 20) = 20/120 = 1/6 = 16.67%
- You need at least 16.67% equity to make this call profitable

### Hand Equity
Your equity is the percentage chance you have to win the hand at showdown.

### Example
- You have a flush draw (9 outs) on the flop
- Your equity is approximately 36% (9 outs × 4% rule)
- If pot odds are better than 36%, you should call

### Implied Odds
Implied odds consider future betting rounds. If you might win a big pot when you hit, you can call with worse pot odds.`,
  },
  4: {
    title: 'Bluffing & Semi-Bluffing',
    content: `# Bluffing & Semi-Bluffing

## The Art of Bluffing

Bluffing is betting with a weak hand to make your opponent fold a better hand.

### When to Bluff
- **You have fold equity**: Your opponent is likely to fold
- **The board favors your range**: You could have strong hands
- **You're in position**: Easier to control the pot
- **Your opponent is weak**: They've shown weakness (checked)

### Semi-Bluffing
A semi-bluff is a bet with a drawing hand that:
- Might win if called (by making your draw)
- Might win if your opponent folds

### Bluffing Frequency
- Don't bluff too often (good players will catch on)
- Don't bluff too rarely (you'll be too predictable)
- Aim for a balanced strategy

### Key Rule
**Bluff when the story makes sense**. If you've been betting strong, a bluff on the river can work.`,
  },
  5: {
    title: 'Reading Opponents',
    content: `# Reading Opponents

## Observing Your Opponents

The best players pay attention to their opponents' tendencies and adjust accordingly.

### Betting Patterns
- **Tight players**: Only bet with strong hands - fold more often
- **Loose players**: Bet with weak hands - call more often
- **Aggressive players**: Bet and raise frequently - be ready to call down
- **Passive players**: Check and call often - value bet thinner

### Timing Tells
- **Quick calls**: Often weak hands (auto-calling)
- **Long pauses then raise**: Usually strong hands
- **Quick bets**: Often strong hands (confident)

### Position Awareness
- Players who raise from early position usually have strong hands
- Players who call from the button might be on a draw

### Adjust Your Strategy
Once you identify a player's style, adjust:
- Bluff tight players less
- Value bet loose players more
- Fold to aggressive players' raises unless you're strong`,
  },
  6: {
    title: 'Bankroll Management',
    content: `# Bankroll Management

## Protecting Your Bankroll

Bankroll management is crucial for long-term success, even in play-money games.

### General Rules
- **Cash Games**: Have at least 20-30 buy-ins for your stake level
- **Tournaments**: Have at least 50-100 buy-ins
- **Never risk more than 5% of your bankroll in a single session**

### Moving Up Stakes
Only move up when:
- You have enough buy-ins for the new level
- You've been consistently winning at your current level
- You're comfortable with the increased stakes

### Moving Down Stakes
Don't be afraid to move down if:
- Your bankroll drops below safe levels
- You're on a losing streak
- You're not comfortable at the current level

### Mental Game
- Don't play when tilted
- Set loss limits for each session
- Take breaks after big wins or losses

Remember: The goal is long-term growth, not short-term gains.`,
  },
}

export default async function LessonPage({ params }: { params: { lessonId: string } }) {
  const lessonId = parseInt(params.lessonId)
  const lesson = LESSONS[lessonId]

  if (!lesson) {
    notFound()
  }

  const supabase = await createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  // Mark lesson as completed when page loads (you could add a button for this)
  // For now, we'll just track that they viewed it

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-4">
        <Link href="/learn">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Lessons
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-8">
          <h1 className="text-4xl font-bold mb-6">{lesson.title}</h1>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            {lesson.content.split('\n').map((line, i) => {
              if (line.startsWith('# ')) {
                return <h1 key={i} className="text-3xl font-bold mt-8 mb-4">{line.slice(2)}</h1>
              } else if (line.startsWith('## ')) {
                return <h2 key={i} className="text-2xl font-semibold mt-6 mb-3">{line.slice(3)}</h2>
              } else if (line.startsWith('### ')) {
                return <h3 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(4)}</h3>
              } else if (line.startsWith('- **')) {
                const match = line.match(/\*\*(.*?)\*\*: (.*)/)
                if (match) {
                  return (
                    <li key={i} className="ml-4 mb-2">
                      <strong>{match[1]}</strong>: {match[2]}
                    </li>
                  )
                }
              } else if (line.startsWith('- ')) {
                return <li key={i} className="ml-4 mb-2">{line.slice(2)}</li>
              } else if (line.trim() === '') {
                return <br key={i} />
              } else {
                return <p key={i} className="mb-4">{line}</p>
              }
            })}
          </div>

          <div className="flex justify-between mt-8 pt-6 border-t">
            {lessonId > 1 ? (
              <Link href={`/learn/${lessonId - 1}`}>
                <Button variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
              </Link>
            ) : (
              <div />
            )}
            {lessonId < 6 ? (
              <Link href={`/learn/${lessonId + 1}`}>
                <Button>
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button onClick={async () => {
                await supabase
                  .from('lesson_progress')
                  .upsert({
                    user_id: user.id,
                    lesson_id: lessonId,
                    completed: true,
                    progress_percent: 100
                  })
                redirect('/learn')
              }}>
                Complete Lesson
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


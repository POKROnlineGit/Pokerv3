'use client'

import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BookOpen } from 'lucide-react'
import { useTheme } from '@/components/providers/ThemeProvider'

interface LessonCardProps {
  id: number
  title: string
  description: string
  completed?: boolean
  progress?: number
}

export function LessonCard({ id, title, description, completed, progress }: LessonCardProps) {
  const { currentTheme } = useTheme()
  const accentColor = currentTheme.colors.accent[0]

  return (
    <Link href={`/learn/${id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full bg-card">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" style={{ color: accentColor }} />
                {title}
              </CardTitle>
              <CardDescription className="mt-2">{description}</CardDescription>
            </div>
            {completed && (
              <div 
                className="px-2 py-1 rounded text-xs font-semibold text-white"
                style={{ backgroundColor: accentColor }}
              >
                ✓
              </div>
            )}
          </div>
          {progress !== undefined && progress > 0 && progress < 100 && (
            <div className="mt-4">
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ 
                    width: `${progress}%`,
                    backgroundColor: accentColor,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{progress}% complete</p>
            </div>
          )}
        </CardHeader>
      </Card>
    </Link>
  )
}


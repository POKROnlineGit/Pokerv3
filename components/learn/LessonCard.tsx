"use client";

import Link from "next/link";
import { Lesson } from "@/lib/types/lessons";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LessonCardProps {
  lesson: Lesson;
}

export function LessonCard({ lesson }: LessonCardProps) {
  // Calculate progress percentage for visual bar
  // If completed, 100%. If not, (current_page / total_pages) * 100
  const progressPercent = lesson.is_completed 
    ? 100 
    : lesson.total_pages > 0 
      ? ((lesson.current_page || 0) / lesson.total_pages) * 100 
      : 0;

  const isStarted = (lesson.current_page || 0) > 0 && !lesson.is_completed;

  return (
    <Link href={`/learn/${lesson.slug}`} className="group block h-full">
      <Card className="h-full transition-all duration-300 hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-900/20 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-1">
              <Badge 
                variant="outline" 
                className={cn(
                  "mb-2 capitalize",
                  lesson.category === 'beginner' && "border-emerald-500/30 text-emerald-400",
                  lesson.category === 'intermediate' && "border-blue-500/30 text-blue-400",
                  lesson.category === 'advanced' && "border-purple-500/30 text-purple-400"
                )}
              >
                {lesson.category}
              </Badge>
              <CardTitle className="text-xl group-hover:text-emerald-400 transition-colors">
                {lesson.title}
              </CardTitle>
            </div>
            <div className="shrink-0">
              {lesson.is_completed ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              ) : isStarted ? (
                <div className="relative">
                  <PlayCircle className="h-6 w-6 text-blue-400" />
                </div>
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground/30" />
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <p className="text-muted-foreground text-sm line-clamp-2 min-h-[2.5rem]">
            {lesson.description}
          </p>
          
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {lesson.is_completed 
                  ? "Completed" 
                  : isStarted 
                    ? `In Progress (${Math.round(progressPercent)}%)` 
                    : `${lesson.total_pages} Pages`}
              </span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        </CardContent>

        <CardFooter className="pt-2 pb-4">
          <span className="text-sm font-medium text-emerald-500 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 flex items-center gap-2">
            {lesson.is_completed ? "Review Lesson" : isStarted ? "Resume Lesson" : "Start Lesson"} 
            <ArrowRight className="h-4 w-4" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}


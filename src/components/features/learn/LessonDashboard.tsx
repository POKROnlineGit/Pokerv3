"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Lesson } from "@/lib/types/lessons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Trophy, Calculator, Grid, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { LessonCard } from "@/components/features/learn/LessonCard";

interface LessonDashboardProps {
  initialLessons: Lesson[];
}

export function LessonDashboard({ initialLessons }: LessonDashboardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [isProgressOpen, setIsProgressOpen] = useState(false);

  // Calculate stats
  const stats = useMemo(() => {
    const total = initialLessons.length;
    const completed = initialLessons.filter(l => l.is_completed).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percentage };
  }, [initialLessons]);

  // Filter and sort logic
  const filteredLessons = useMemo(() => {
    const filtered = initialLessons.filter(lesson => {
      const matchesSearch = lesson.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTab = activeTab === "all" || lesson.category === activeTab;
      return matchesSearch && matchesTab;
    });
    
    // Sort by category if "all" tab is active
    if (activeTab === "all") {
      const categoryOrder = { beginner: 0, intermediate: 1, advanced: 2 };
      return filtered.sort((a, b) => {
        const aOrder = categoryOrder[a.category as keyof typeof categoryOrder] ?? 999;
        const bOrder = categoryOrder[b.category as keyof typeof categoryOrder] ?? 999;
        return aOrder - bOrder;
      });
    }
    
    return filtered;
  }, [initialLessons, searchQuery, activeTab]);

  // Render progress card content
  const progressCardContent = (
    <Card className="bg-card backdrop-blur-sm border flex flex-col">
      {/* Course Progress */}
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Course Progress</CardTitle>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-3xl font-bold">{stats.percentage}%</span>
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-emerald-500" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{stats.completed} of {stats.total} lessons completed</p>
        </div>
      </CardHeader>

      {/* Quick Links */}
      <CardHeader>
        <CardTitle className="text-lg">Quick Links</CardTitle>
        <CardContent className="p-0 pt-4 space-y-4">
          <Link href="/tools/equity-calculator">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Calculator className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-emerald-400">Equity Evaluator</div>
                <div className="text-xs text-muted-foreground">Calculate hand equity</div>
              </div>
            </div>
          </Link>
          <Link href="/tools/range-analysis">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Grid className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-emerald-400">Range Evaluator</div>
                <div className="text-xs text-muted-foreground">Analyze poker ranges</div>
              </div>
            </div>
          </Link>
        </CardContent>
      </CardHeader>
    </Card>
  );

  return (
    <div className="relative">
      {/* Progress Button - Top Right (Mobile Only) */}
      {isMobile && (
        <button
          onClick={() => setIsProgressOpen(true)}
          className="fixed top-4 right-4 z-[100] p-2 bg-[hsl(222.2,84%,4.9%)] text-white rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
          aria-label="Open progress"
        >
          <Trophy className="h-6 w-6" />
        </button>
      )}

      {/* Progress Overlay (Mobile Only) */}
      <AnimatePresence>
        {isMobile && isProgressOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[9998]"
              onClick={() => setIsProgressOpen(false)}
            />
            {/* Progress Card Overlay */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="w-full max-w-sm pointer-events-auto">
                <Card className="w-full h-[calc(100vh-10rem)] rounded-lg text-card-foreground shadow-sm bg-card backdrop-blur-sm border flex flex-col">
                  {/* Header with Close Button */}
                  <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
                    <CardTitle className="text-2xl font-bold text-white tracking-tight">
                      Course Progress
                    </CardTitle>
                    <button
                      onClick={() => setIsProgressOpen(false)}
                      className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                      aria-label="Close progress"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Progress Content */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-3xl font-bold">{stats.percentage}%</span>
                        <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                          <Trophy className="h-6 w-6 text-emerald-500" />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{stats.completed} of {stats.total} lessons completed</p>
                    </div>

                    {/* Quick Links */}
                    <div className="mt-8">
                      <CardTitle className="text-lg mb-4">Quick Links</CardTitle>
                      <div className="space-y-4">
                        <Link href="/tools/equity-calculator">
                          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer">
                            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <Calculator className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-emerald-400">Equity Evaluator</div>
                              <div className="text-xs text-muted-foreground">Calculate hand equity</div>
                            </div>
                          </div>
                        </Link>
                        <Link href="/tools/range-analysis">
                          <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50 hover:bg-emerald-500/10 cursor-pointer">
                            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                              <Grid className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-emerald-400">Range Evaluator</div>
                              <div className="text-xs text-muted-foreground">Analyze poker ranges</div>
                            </div>
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex gap-6 h-[calc(100vh-8rem)]">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <h1 className={cn("text-3xl font-bold mb-4 text-foreground", isMobile && "text-center")}>Learn</h1>

        {/* Controls */}
        <div className="flex flex-col gap-4 mb-4">
          {/* Tabs - Hidden on Mobile */}
          {!isMobile && (
            <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All Lessons</TabsTrigger>
                <TabsTrigger value="beginner">Beginner</TabsTrigger>
                <TabsTrigger value="intermediate">Intermediate</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="relative w-full">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search lessons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        {/* Desktop: Table */}
        {!isMobile && (
          <Card className="bg-card backdrop-blur-sm border flex-1 flex flex-col min-h-0 overflow-hidden">
            <CardContent className="p-0 flex-1 overflow-auto">
              <div className="relative w-full h-full">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-sm z-20 border-b rounded-t-lg" style={{ position: 'sticky', top: 0 }}>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[120px]">Category</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-[150px]">Progress</TableHead>
                    <TableHead className="w-[100px] text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLessons.length > 0 ? (
                    filteredLessons.map((lesson) => {
                      const progressPercent = lesson.is_completed
                        ? 100
                        : lesson.total_pages > 0
                          ? ((lesson.current_page || 0) / lesson.total_pages) * 100
                          : 0;
                      const isStarted = (lesson.current_page || 0) > 0 && !lesson.is_completed;

                      return (
                        <TableRow 
                          key={lesson.id} 
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => router.push(`/learn/${lesson.slug}`)}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "capitalize",
                                lesson.category === 'beginner' && "border-emerald-500/30 text-emerald-400",
                                lesson.category === 'intermediate' && "border-blue-500/30 text-blue-400",
                                lesson.category === 'advanced' && "border-purple-500/30 text-purple-400"
                              )}
                            >
                              {lesson.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{lesson.title}</div>
                              <div className="text-sm text-muted-foreground line-clamp-1">
                                {lesson.description}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>
                                  {lesson.is_completed
                                    ? "Completed"
                                    : isStarted
                                      ? `${Math.round(progressPercent)}%`
                                      : "Not Started"}
                                </span>
                              </div>
                              <Progress value={progressPercent} className="h-1.5" />
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1 text-sm font-medium text-emerald-500">
                              {lesson.is_completed ? "Review" : isStarted ? "Resume" : "Start"}
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-muted-foreground">No lessons found</p>
                          <p className="text-sm text-muted-foreground">Try adjusting your search or category filter.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </TableBody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mobile: Cards */}
        {isMobile && (
          <div className="flex-1 overflow-y-auto">
            {filteredLessons.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 pb-4">
                {filteredLessons.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </div>
            ) : (
              <Card className="bg-card backdrop-blur-sm border">
                <CardContent className="p-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No lessons found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your search.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        </div>

      {/* Fixed Right Sidebar - Hidden on Mobile */}
      {!isMobile && (
        <div className="w-80 flex-shrink-0">
          <div className="mt-[4.5rem]">
            {progressCardContent}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}


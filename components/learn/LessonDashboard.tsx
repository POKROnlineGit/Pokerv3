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
import { Search, Trophy, Calculator, Grid, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LessonDashboardProps {
  initialLessons: Lesson[];
}

export function LessonDashboard({ initialLessons }: LessonDashboardProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");

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

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <h1 className="text-3xl font-bold mb-4 text-foreground">Learn</h1>

        {/* Controls */}
        <div className="flex flex-col gap-4 mb-4">
          <Tabs defaultValue="all" className="w-full md:w-auto" onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All Lessons</TabsTrigger>
              <TabsTrigger value="beginner">Beginner</TabsTrigger>
              <TabsTrigger value="intermediate">Intermediate</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
          </Tabs>

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

        {/* Table */}
        <Card className="bg-card/50 backdrop-blur-sm border flex-1 flex flex-col min-h-0 overflow-hidden">
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
      </div>

      {/* Fixed Right Sidebar */}
      <div className="w-80 flex-shrink-0">
        <div className="mt-[4.5rem]">
          <Card className="bg-card/50 backdrop-blur-sm border flex flex-col">
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
        </div>
      </div>
    </div>
  );
}


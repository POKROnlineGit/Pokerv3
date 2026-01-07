"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lesson, ContentBlock } from "@/lib/types/lessons";
import { updateLessonProgress, completeLesson } from "@/app/learn/actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ChevronRight, ChevronLeft, CheckCircle2, Lightbulb, Calculator, Grid } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Card as PokerCard } from "@/components/Card";
import { RangeGrid } from "@/components/analysis/RangeGrid";

interface LessonRendererProps {
  lesson: Lesson;
}

export function LessonRenderer({ lesson }: LessonRendererProps) {
  const router = useRouter();
  
  // Initialize state with saved progress, clamped to valid bounds
  const [pageIndex, setPageIndex] = useState(() => {
    const saved = lesson.current_page || 0;
    return Math.min(Math.max(0, saved), (lesson.content?.length || 1) - 1);
  });

  const [isCompleting, setIsCompleting] = useState(false);

  // Safety checks
  if (!lesson.content || lesson.content.length === 0) {
    return (
      <div className="max-w-3xl mx-auto pb-24">
        <div className="text-center py-12">
          <p className="text-muted-foreground">This lesson has no content.</p>
        </div>
      </div>
    );
  }

  const currentPage = lesson.content[pageIndex];
  const totalPages = lesson.content.length;
  const progressPercent = ((pageIndex + 1) / totalPages) * 100;

  // Safety check for current page
  if (!currentPage || !currentPage.blocks) {
    return (
      <div className="max-w-3xl mx-auto pb-24">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Page content not available.</p>
        </div>
      </div>
    );
  }

  // Sync progress to DB when page changes (debounce could be added, but simple is fine here)
  useEffect(() => {
    if (pageIndex > (lesson.current_page || 0)) {
      updateLessonProgress(lesson.id, pageIndex);
    }
  }, [pageIndex, lesson.id, lesson.current_page]);

  const handleNext = () => {
    if (pageIndex < totalPages - 1) {
      setPageIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (pageIndex > 0) {
      setPageIndex(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFinish = async () => {
    setIsCompleting(true);
    await completeLesson(lesson.id);

    // Slight delay before redirect
    setTimeout(() => {
      router.push('/learn');
      router.refresh();
    }, 1500);
  };

  // --- Block Renderers ---

  const renderBlock = (block: ContentBlock, index: number) => {
    switch (block.type) {
      case 'header':
        return (
          <h2 key={index} className="text-2xl font-bold mt-8 mb-4" style={{ color: '#10b981' }}>
            {block.value}
          </h2>
        );
      
      case 'text':
        return (
          <p key={index} className="text-lg leading-relaxed mb-6" style={{ color: '#ffffff' }}>
            {block.value}
          </p>
        );

      case 'list':
        return (
          <ul key={index} className="list-disc list-inside space-y-2 mb-6 ml-4" style={{ color: '#ffffff' }}>
            {block.items?.map((item, i) => (
              <li key={i} className="pl-2"><span style={{ color: '#ffffff' }}>{item}</span></li>
            ))}
          </ul>
        );

      case 'info_card':
        return (
          <Alert key={index} className="mb-8 border-blue-500/30 bg-blue-500/10 text-blue-200">
            <Lightbulb className="h-5 w-5 text-blue-400" />
            <AlertTitle className="text-blue-400 font-semibold mb-2">{block.title}</AlertTitle>
            <AlertDescription className="text-blue-100/80 leading-relaxed">
              {block.value}
            </AlertDescription>
          </Alert>
        );

      case 'tool_link':
        const toolUrl = block.tool === 'equity-calculator' ? '/tools/equity-calculator' 
          : block.tool === 'range-analysis' ? '/tools/range-analysis' 
          : '/play';
          
        const Icon = block.tool === 'equity-calculator' ? Calculator : Grid;

        return (
          <Link key={index} href={toolUrl} target="_blank">
            <Card className="mb-8 border-emerald-500/30 bg-emerald-500/5 cursor-pointer hover:border-emerald-500/50">
              <CardHeader className="flex flex-row items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-emerald-400 flex items-center gap-2">
                    {block.title} <ChevronRight className="h-4 w-4" />
                  </CardTitle>
                  <CardDescription className="text-emerald-200/60">
                    {block.description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );

      case 'image':
        return (
          <div key={index} className="mb-8">
            <div className="relative w-full h-[300px] mb-4 flex justify-center">
              {block.url && (
                <Image
                  src={block.url}
                  alt={block.alt || block.caption || 'Lesson image'}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 800px"
                />
              )}
            </div>
            {block.caption && (
              <p className="text-center text-sm text-muted-foreground italic" style={{ color: '#9ca3af' }}>
                {block.caption}
              </p>
            )}
          </div>
        );

      case 'poker_hand':
        return (
          <div key={index} className="mb-8">
            <div className="flex justify-center items-center gap-4 mb-4 flex-wrap">
              {block.cards && block.cards.length > 0 ? (
                block.cards.map((card, i) => (
                  <div key={i} className="flex-shrink-0" style={{ width: '5rem', height: '7rem' }}>
                    <PokerCard card={card as any} />
                  </div>
                ))
              ) : (
                <p style={{ color: '#9ca3af' }}>No cards specified</p>
              )}
            </div>
            {block.caption && (
              <p className="text-center text-sm text-muted-foreground italic" style={{ color: '#9ca3af' }}>
                {block.caption}
              </p>
            )}
          </div>
        );

      case 'range_grid':
        return (
          <div key={index} className="mb-8">
            <div className="flex justify-center">
              <div className="inline-block">
                <RangeGrid
                  selectedHands={new Set(block.hands || [])}
                  onToggle={() => {}} // Read-only
                />
              </div>
            </div>
            {block.caption && (
              <p className="text-center text-sm text-muted-foreground italic mt-4" style={{ color: '#9ca3af' }}>
                {block.caption}
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto pt-0 pb-6 px-14 max-w-7xl relative z-10" style={{ position: 'relative', zIndex: 10 }}>
      <Card className="bg-card backdrop-blur-sm border" style={{ height: 'calc(100vh - 6rem)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 6rem)' }}>
        {/* Top Bar */}
        <CardHeader className="pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between text-sm mb-2" style={{ color: '#ffffff' }}>
            <span>{lesson.title}</span>
            <span>Page {pageIndex + 1} of {totalPages}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </CardHeader>

        {/* Scrollable Content Container */}
        <CardContent className="flex-1 overflow-y-auto p-6" style={{ minHeight: 0 }}>
          <div key={`page-${pageIndex}`} style={{ color: '#ffffff' }}>
            <div className="mb-6">
              <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-8" style={{ color: '#ffffff' }}>
                {currentPage.title || 'Untitled'}
              </h1>
            </div>
            
            {/* Render Blocks */}
            <div style={{ position: 'relative', zIndex: 10 }}>
              {currentPage.blocks && currentPage.blocks.length > 0 ? (
                currentPage.blocks.map((block, i) => renderBlock(block, i))
              ) : (
                <p style={{ color: '#9ca3af' }}>No content available for this page.</p>
              )}
            </div>
          </div>
        </CardContent>

        {/* Navigation Footer */}
        <CardFooter className="pt-2 pb-2 border-t flex-shrink-0 flex justify-between items-center">
          <Button 
            variant="ghost" 
            onClick={handlePrev} 
            disabled={pageIndex === 0}
            className="gap-2 bg-transparent border-0 shadow-none hover:bg-white/5"
            style={{
              opacity: pageIndex === 0 ? 0.5 : 1,
            }}
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>

          {pageIndex === totalPages - 1 ? (
            <Button 
              onClick={handleFinish} 
              disabled={isCompleting}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2 min-w-[140px]"
            >
              {isCompleting ? "Completing..." : <>Complete Lesson <CheckCircle2 className="h-4 w-4" /></>}
            </Button>
          ) : (
            <Button 
              onClick={handleNext} 
              className="gap-2 min-w-[140px] text-white border-0 shadow-none"
              style={{
                background: 'linear-gradient(to right, #059669, #15803d)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, #10b981, #16a34a)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to right, #059669, #15803d)';
              }}
            >
              Next Page <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}


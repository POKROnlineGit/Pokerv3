import { notFound } from "next/navigation";
import { getLessonBySlug } from "../actions";
import { LessonRenderer } from "@/components/features/learn/LessonRenderer";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface LessonPageProps {
  params: Promise<{ slug: string }>;
}

// Force dynamic rendering to ensure progress state is fresh
export const dynamic = 'force-dynamic';

export default async function LessonPage({ params }: LessonPageProps) {
  const resolvedParams = await params;
  const lesson = await getLessonBySlug(resolvedParams.slug);

  if (!lesson) {
    notFound();
  }

  return (
    <div className="min-h-screen relative" style={{ position: 'relative', zIndex: 10 }}>
      {/* Header */}
      <header className="sticky top-0" style={{ position: 'sticky', zIndex: 30 }}>
        <div className="container mx-auto px-14 h-auto flex items-center py-2">
          <Link href="/learn">
            <Button variant="ghost" size="sm" className="gap-2 bg-transparent border-0 shadow-none hover:bg-white/5" style={{ color: '#ffffff' }}>
              <ArrowLeft className="h-4 w-4" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative" style={{ position: 'relative', zIndex: 10, overflow: 'hidden' }}>
        <div className="relative" style={{ position: 'relative', zIndex: 10 }}>
          <LessonRenderer lesson={lesson} />
        </div>
      </main>
    </div>
  );
}


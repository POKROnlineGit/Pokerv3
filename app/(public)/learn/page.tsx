import { getLessons } from "./actions";
import { LessonDashboard } from "@/components/features/learn/LessonDashboard";

// Force dynamic because progress is user-specific
export const dynamic = 'force-dynamic';

export default async function LearnPage() {
  const lessons = await getLessons();

  return (
    <div className="container mx-auto py-6 px-4 md:px-14 max-w-7xl h-full">
      <LessonDashboard initialLessons={lessons} />
    </div>
  );
}


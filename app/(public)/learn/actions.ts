"use server";

import { createServerComponentClient } from "@/lib/api/supabase/client";
import { Lesson } from "@/lib/types/lessons";
import { revalidatePath } from "next/cache";

/**
 * Fetches all lessons with the current user's progress status.
 * Used for the main dashboard.
 */
export async function getLessons(): Promise<Lesson[]> {
  const supabase = await createServerComponentClient();

  // 1. Get User
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Fetch Lessons
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching lessons:", error);
    return [];
  }

  // 3. If user is logged in, fetch their progress map
  const progressMap = new Map<
    string,
    { is_completed: boolean; current_page: number }
  >();

  if (user) {
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("lesson_id, is_completed, current_page")
      .eq("user_id", user.id);

    if (progress) {
      progress.forEach(
        (p: {
          lesson_id: string;
          is_completed: boolean;
          current_page: number;
        }) => {
          progressMap.set(p.lesson_id, {
            is_completed: p.is_completed,
            current_page: p.current_page,
          });
        }
      );
    }
  }

  // 4. Merge progress status into lesson objects
  return lessons.map((lesson: any) => {
    const p = progressMap.get(lesson.id);
    return {
      ...lesson,
      is_completed: p?.is_completed || false,
      current_page: p?.current_page || 0,
    };
  });
}

/**
 * Fetches a single lesson by its slug.
 * Also returns the user's saved progress for this specific lesson.
 */
export async function getLessonBySlug(slug: string): Promise<Lesson | null> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !lesson) return null;

  // Default progress
  let is_completed = false;
  let current_page = 0;

  // Fetch specific progress if user exists
  if (user) {
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("is_completed, current_page")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson.id)
      .single();

    if (progress) {
      is_completed = progress.is_completed;
      current_page = progress.current_page;
    }
  }

  return {
    ...lesson,
    is_completed,
    current_page,
  } as Lesson;
}

/**
 * Updates the user's current page in a lesson.
 * This allows them to resume where they left off.
 */
export async function updateLessonProgress(
  lessonId: string,
  pageIndex: number
) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      current_page: pageIndex,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id, lesson_id" }
  );

  if (error) {
    console.error("Failed to save progress", error);
  }
}

/**
 * Marks a lesson as fully complete.
 */
export async function completeLesson(lessonId: string) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      is_completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id, lesson_id" }
  );

  if (!error) {
    revalidatePath("/learn");
    revalidatePath(`/learn/[slug]`, "page");
  }
}

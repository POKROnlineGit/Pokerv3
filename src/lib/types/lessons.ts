export type LessonCategory = 'beginner' | 'intermediate' | 'advanced';

export type ContentBlockType = 'header' | 'text' | 'list' | 'info_card' | 'tool_link' | 'image' | 'poker_hand' | 'range_grid';

// A single block of content (e.g. a paragraph or a list)
export interface ContentBlock {
  type: ContentBlockType;
  value?: string;
  title?: string; // For info_cards and tool_links
  description?: string; // For tool_links
  tool?: string; // For tool_links (e.g. 'equity-calculator')
  items?: string[]; // For lists
  url?: string; // For images
  alt?: string; // For images
  cards?: string[]; // For poker_hand (e.g. ['As', 'Kh'])
  hands?: string[]; // For range_grid (e.g. ['AA', 'AKs', 'AKo'])
  caption?: string; // Optional caption for both image and poker_hand
}

// A single page within a lesson
export interface LessonPage {
  title: string;
  blocks: ContentBlock[];
}

// The Lesson object from DB
export interface Lesson {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: LessonCategory;
  sort_order: number;
  total_pages: number;
  content: LessonPage[]; // Changed from ContentBlock[] to LessonPage[]
  created_at: string;
  // Joined fields from progress
  is_completed?: boolean;
  current_page?: number;
}

export interface LessonProgress {
  user_id: string;
  lesson_id: string;
  current_page: number;
  is_completed: boolean;
  completed_at?: string;
}


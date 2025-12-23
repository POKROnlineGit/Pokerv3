import { PlayPageContent } from "@/components/PlayPageContent";

// Keep this route dynamic so it always reflects current game state
export const dynamic = "force-dynamic";

// Minimal server component wrapper that simply renders the client lobby.
// All Supabase/game detection logic now runs client-side in PlayPageContent,
// which avoids fragile server handler issues on /play.
export default function PlayPage() {
  return <PlayPageContent />;
}

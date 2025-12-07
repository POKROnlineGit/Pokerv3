import { redirectIfInGame } from "@/lib/redirectIfInGame";
import { PlayPageContent } from "@/components/PlayPageContent";

export default async function PlayPage() {
  await redirectIfInGame();

  return <PlayPageContent />;
}

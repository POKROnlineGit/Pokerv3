import { PlayPageContent } from "@/components/PlayPageContent";
import { createServerClient } from "@/lib/supabaseServer";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PlayPage() {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: games, error } = await supabase
    .from("games")
    .select("id, player_ids, players, left_players")
    .eq("status", "active");

  if (error) {
    console.error("[PlayPage] Failed to check active games", error);
  }

  const activeGame = games?.find((game: any) => {
    const leftPlayers: string[] = Array.isArray(game.left_players)
      ? game.left_players.map((id: any) => String(id))
      : [];

    const userId = String(user.id);

    if (leftPlayers.includes(userId)) return false;

    // Prefer the indexed player_ids column
    const playerIds = Array.isArray(game.player_ids)
      ? game.player_ids.map((id: any) => String(id))
      : [];
    if (playerIds.includes(userId)) {
      return true;
    }

    // Fallback: check players JSON
    if (Array.isArray(game.players)) {
      return game.players.some((p: any) => {
        const playerId = p?.id || p?.userId || p?.user_id;
        return playerId && String(playerId) === userId;
      });
    }

    return false;
  });

  if (activeGame) {
    redirect(`/play/game/${activeGame.id}`);
  }

  return <PlayPageContent />;
}

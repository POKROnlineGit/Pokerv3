import { createServerClient } from "@/lib/api/supabase/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function redirectIfInGame() {
  // Check if we're already on a game page - skip redirect if so (avoid wasteful queries)
  const headersList = await headers();
  const referer = headersList.get("referer") || "";

  // If the referer indicates we're coming from a game page, skip the check
  // This prevents unnecessary database queries when already on a game page
  if (referer.includes("/play/game/")) {
    return;
  }

  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Query all active or starting games and check if user is a player
    // This approach is reliable and works regardless of array query syntax
    const { data: games } = await supabase
      .from("games")
      .select("id, player_ids, players, tournament_id")
      .in("status", ["active", "starting"]);

    if (games && games.length > 0) {
      // Find the first game where the user is a player
      const game = games.find((g) => {
        // First check player_ids array (indexed, most efficient)
        if (g.player_ids && Array.isArray(g.player_ids)) {
          if (g.player_ids.some((id: any) => String(id) === String(user.id))) {
            return true;
          }
        }
        // Fallback: check players JSONB directly
        if (g.players && Array.isArray(g.players)) {
          return g.players.some((p: any) => {
            const playerId = p?.id || p?.userId || p?.user_id;
            return playerId && String(playerId) === String(user.id);
          });
        }
        return false;
      });

      if (game) {
        // Redirect to tournament game page if it's a tournament game
        if (game.tournament_id) {
          redirect(`/play/tournaments/game/${game.id}`);
        } else {
          redirect(`/play/game/${game.id}`);
        }
      }
    }
  }
}

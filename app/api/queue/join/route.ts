import { createClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = await req.json();
  const { queue_type = "six_max" } = body;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return new Response("Unauthorized", { status: 401 });

  // Check if user is in an active game (fallback check - RLS also enforces this)
  const { data: games } = await supabase
    .from("games")
    .select("id, player_ids, players")
    .in("status", ["active", "starting"]);

  if (games && games.length > 0) {
    // Check if user is in any active game
    const userInGame = games.some((g) => {
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

    if (userInGame) {
      return new Response("Already in an active game", { status: 400 });
    }
  }

  // UPSERT = insert if not exists, update if already there
  // RLS policy will also block this if user is in game (defense in depth)
  const { error } = await supabase.from("queue").upsert(
    { user_id: user.id, queue_type },
    { onConflict: "user_id" } // ← this prevents the duplicate key error
  );

  if (error) {
    console.error("Error joining queue:", error);
    // Check if error is from RLS policy
    if (error.message?.includes("new row violates row-level security policy")) {
      return new Response("Cannot join queue while in an active game", {
        status: 403,
      });
    }
    return new Response("Error", { status: 500 });
  }

  return new Response("OK");
}

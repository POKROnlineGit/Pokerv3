"use client";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { Trophy, Clock, Coins, Play } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { ReplayViewer } from "@/components/replay/ReplayViewer";
// @ts-ignore - Importing from shared backend
import { PokerCodec, indexToCard } from "@backend/game/handHistory/PokerCodec";

interface HandSummary {
  id: string;
  game_id: string;
  hand_index: number;
  final_pot: number;
  winner_id: string | null;
  played_at: string;
  replay_data: string;
  player_manifest: Record<string, string>;
  config?: {
    gameType?: string;
    sb?: number;
    bb?: number;
    [key: string]: any;
  };
}

interface HandHistoryListProps {
  hands: HandSummary[];
  currentUserId: string;
}

// Helper to convert card index to display string
const indexToCardString = (index: number): string => {
  try {
    return indexToCard(index);
  } catch {
    return "??";
  }
};

// Individual hand card component
function HandCard({
  hand,
  currentUserId,
  playerNames,
  onWatchReplay,
}: {
  hand: HandSummary;
  currentUserId: string;
  playerNames: Record<string, string>;
  onWatchReplay: () => void;
}) {
  const isWinner = hand.winner_id === currentUserId;

  // Extract board cards from decoded data
  const boardCards = useMemo(() => {
    try {
      if (!hand.replay_data) return [];
      const buffer = PokerCodec.fromHex(hand.replay_data);
      const decoded = PokerCodec.decode(buffer);
      return (decoded.board || []).map((idx: number) => indexToCardString(idx));
    } catch {
      return [];
    }
  }, [hand.replay_data]);

  // Get winner name
  const winnerName = hand.winner_id
    ? playerNames[hand.winner_id] ||
      `Seat ${
        Object.entries(hand.player_manifest).find(
          ([_, id]) => id === hand.winner_id
        )?.[0] || "?"
      }`
    : null;

  return (
    <Card className="overflow-hidden border-2 border-transparent hover:border-muted-foreground/20 transition-all">
      {/* Single-row layout */}
      <div className="p-4 flex items-center justify-between gap-4 bg-muted/30">
        {/* Left: Hand info */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="flex flex-col gap-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-primary">
                #{hand.hand_index}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(hand.played_at), {
                  addSuffix: true,
                })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              ID: {hand.game_id.slice(0, 8)}
            </div>
          </div>

          {/* Board Cards */}
          {boardCards.length > 0 && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-muted-foreground mr-1">Board:</span>
              <div className="flex gap-1">
                {boardCards.map((card, idx) => (
                  <span
                    key={idx}
                    className="font-mono text-xs bg-background px-1.5 py-0.5 rounded border"
                  >
                    {card}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Winner */}
          {winnerName && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs text-muted-foreground">Winner:</span>
              <span
                className={`text-xs font-medium ${
                  isWinner ? "text-emerald-400" : "text-foreground"
                }`}
              >
                {isWinner ? "You" : winnerName}
              </span>
            </div>
          )}
        </div>

        {/* Right: Pot, Status, and Watch Replay button */}
        <div className="flex items-center gap-6 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground flex items-center justify-end gap-1">
              Pot <Coins className="w-3 h-3" />
            </p>
            <p className="font-mono font-medium">{hand.final_pot}</p>
          </div>

          <div className="text-right w-20 flex justify-end">
            {isWinner ? (
              <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm">
                <Trophy className="w-4 h-4" /> WON
              </div>
            ) : (
              <span className="text-sm text-muted-foreground font-medium">
                Played
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onWatchReplay}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Watch Replay
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function HandHistoryList({
  hands,
  currentUserId,
}: HandHistoryListProps) {
  const supabase = createClientComponentClient();
  const [selectedHand, setSelectedHand] = useState<HandSummary | null>(null);
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  // Fetch player names in bulk for all hands
  useEffect(() => {
    if (!hands || hands.length === 0) return;

    const fetchPlayerNames = async () => {
      // Collect all unique player IDs from all hands
      const playerIds = new Set<string>();
      hands.forEach((hand) => {
        Object.values(hand.player_manifest).forEach((id) => {
          playerIds.add(id);
        });
      });

      if (playerIds.size === 0) return;

      try {
        // Fetch usernames from profiles table
        const { data, error } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", Array.from(playerIds));

        if (error) {
          console.error("Error fetching player names:", error);
          return;
        }

        // Build mapping
        const names: Record<string, string> = {};
        data?.forEach((profile) => {
          names[profile.id] =
            profile.username || `User ${profile.id.slice(0, 8)}`;
        });

        setPlayerNames(names);
      } catch (error) {
        console.error("Error fetching player names:", error);
      }
    };

    fetchPlayerNames();
  }, [hands, supabase]);

  if (!hands || hands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center border rounded-lg bg-card/50 text-muted-foreground">
        <p className="text-lg font-medium">No hands recorded</p>
        <p>Play some games to see your history here.</p>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="h-[600px] w-full rounded-md border p-4">
        <div className="space-y-4">
          {hands.map((hand) => (
            <HandCard
              key={hand.id}
              hand={hand}
              currentUserId={currentUserId}
              playerNames={playerNames}
              onWatchReplay={() => setSelectedHand(hand)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Replay Viewer Modal */}
      {selectedHand && (
        <ReplayViewer
          hand={selectedHand}
          currentUserId={currentUserId}
          playerNames={playerNames}
          onClose={() => setSelectedHand(null)}
        />
      )}
    </>
  );
}

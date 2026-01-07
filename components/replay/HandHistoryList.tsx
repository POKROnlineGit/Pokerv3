"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Trophy, Clock, Coins, Play } from "lucide-react";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { ReplayViewer } from "@/components/replay/ReplayViewer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
// @ts-ignore - Importing from shared backend
import {
  PokerCodec,
  indexToCard,
} from "@backend/domain/handHistory/PokerCodec";

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

// Helper to extract board cards from hand
const getBoardCards = (replayData: string): string[] => {
  try {
    if (!replayData) return [];
    const buffer = PokerCodec.fromHex(replayData);
    const decoded = PokerCodec.decode(buffer);
    return (decoded.board || []).map((idx: number) => indexToCardString(idx));
  } catch {
    return [];
  }
};

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

  return (
    <>
      <Card className="bg-card backdrop-blur-sm border flex-1 flex flex-col min-h-0 overflow-hidden">
        <CardContent className="p-0 flex-1 overflow-auto">
          <div className="relative w-full h-full">
            <table className="w-full caption-bottom text-sm">
              <TableHeader
                className="sticky top-0 bg-card/95 backdrop-blur-sm z-20 border-b rounded-t-lg"
                style={{ position: "sticky", top: 0 }}
              >
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[100px]">Hand #</TableHead>
                  <TableHead className="w-[150px]">Date</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead>Winner</TableHead>
                  <TableHead className="w-[100px]">Pot</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hands && hands.length > 0 ? (
                  hands.map((hand) => {
                    const isWinner = hand.winner_id === currentUserId;
                    const boardCards = getBoardCards(hand.replay_data);
                    const winnerName = hand.winner_id
                      ? playerNames[hand.winner_id] ||
                        `Seat ${
                          Object.entries(hand.player_manifest).find(
                            ([_, id]) => id === hand.winner_id
                          )?.[0] || "?"
                        }`
                      : null;

                    return (
                      <TableRow
                        key={hand.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelectedHand(hand)}
                      >
                        <TableCell>
                          <div className="font-mono font-bold text-sm text-primary">
                            #{hand.hand_index}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {hand.game_id.slice(0, 8)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(hand.played_at), {
                              addSuffix: true,
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          {boardCards.length > 0 ? (
                            <div className="flex gap-1">
                              {boardCards.map((card, idx) => (
                                <span
                                  key={idx}
                                  className="font-mono text-xs bg-card px-1.5 py-0.5 rounded border"
                                >
                                  {card}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {winnerName ? (
                            <span
                              className={`text-xs font-medium ${
                                isWinner
                                  ? "text-emerald-400"
                                  : "text-foreground"
                              }`}
                            >
                              {isWinner ? "You" : winnerName}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Coins className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono font-medium">
                              {hand.final_pot}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isWinner ? (
                            <div className="flex items-center gap-1 text-emerald-400 font-bold text-sm">
                              <Trophy className="w-4 h-4" /> WON
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground font-medium">
                              Played
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1 text-sm font-medium text-emerald-500">
                            Watch <Play className="h-4 w-4" />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-muted-foreground">
                          No hands recorded
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Play some games to see your history here.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>

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

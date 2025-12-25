"use client";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Trophy, Clock, Coins, FileText } from "lucide-react";
// @ts-ignore - Importing from shared backend
import { PokerCodec, ActionType } from "@backend/game/handHistory/PokerCodec";
import { useMemo } from "react";

interface HandSummary {
  id: string;
  game_id: string;
  hand_index: number;
  final_pot: number;
  winner_id: string | null;
  played_at: string;
  replay_data: string;
  player_manifest: Record<string, string>;
}

interface HandHistoryListProps {
  hands: HandSummary[];
  currentUserId: string;
}

// Helper to map ActionType enum to readable string
const getActionLabel = (type: number): string => {
  const map: Record<number, string> = {
    [ActionType.FOLD]: "FOLD",
    [ActionType.CHECK]: "CHECK",
    [ActionType.CALL]: "CALL",
    [ActionType.BET_OR_RAISE]: "BET/RAISE",
    [ActionType.WIN_POT]: "WIN POT",
    [ActionType.SHOW_CARDS]: "SHOW CARDS",
    [ActionType.POST_SMALL_BLIND]: "SMALL BLIND",
    [ActionType.POST_BIG_BLIND]: "BIG BLIND",
    [ActionType.POST_ANTE]: "ANTE",
    [ActionType.NEXT_STREET]: "-- STREET --",
  };
  return map[type] || `UNKNOWN(${type})`;
};

// Individual hand card component to allow useMemo usage
function HandCard({
  hand,
  currentUserId,
}: {
  hand: HandSummary;
  currentUserId: string;
}) {
  const isWinner = hand.winner_id === currentUserId;

  // --- CODEC TEST LOGIC ---
  const decodedLog = useMemo(() => {
    try {
      if (!hand.replay_data) return "No replay data found.";

      // Use Universal Codec helper to parse hex string
      const buffer = PokerCodec.fromHex(hand.replay_data);

      // Decode (playerCount is now read from the header)
      const decoded = PokerCodec.decode(buffer);

      // Get sorted seat indices from manifest to match codec order (calculated once)
      const sortedSeats = Object.keys(hand.player_manifest || {})
        .map((k) => parseInt(k, 10))
        .sort((a, b) => a - b);

      // Build the log output
      const logLines: string[] = [];

      // 1. Display Starting Stacks
      if (decoded.startingStacks && decoded.startingStacks.length > 0) {
        logLines.push("=== STARTING STACKS ===");

        decoded.startingStacks.forEach((stack: number, index: number) => {
          const seatIndex = sortedSeats[index];
          const playerId = hand.player_manifest[String(seatIndex)];
          const isMe = playerId === currentUserId;
          const playerLabel = isMe ? "HERO" : `Seat ${seatIndex}`;
          logLines.push(`${playerLabel}: ${stack.toLocaleString()} chips`);
        });

        logLines.push(""); // Empty line separator
      }

      // 2. Format Actions to Text
      const actionLines = decoded.actions.map((action: any, i: number) => {
        let text = `[${i.toString().padStart(2, "0")}] `;

        if (action.type === ActionType.NEXT_STREET) {
          text += `--- ${action.street?.toUpperCase() || "NEXT STREET"} ---`;
        } else {
          // Identify Actor - map manifest index back to seat
          const seatIndex = sortedSeats[action.seatIndex];
          const playerId = hand.player_manifest[String(seatIndex)];
          const isMe = playerId === currentUserId;
          const actorLabel = isMe ? "HERO" : `Seat ${seatIndex}`;

          text += `${actorLabel} ${getActionLabel(action.type)}`;
          if (action.amount) text += ` (${action.amount})`;
        }
        return text;
      });

      logLines.push(...actionLines);
      return logLines.join("\n");
    } catch (e: any) {
      console.error("Codec Error:", e);
      return `Failed to decode hand: ${e.message}`;
    }
  }, [hand.replay_data, hand.player_manifest, currentUserId]);

  return (
    <Card className="overflow-hidden border-2 border-transparent hover:border-muted-foreground/20 transition-all">
      {/* Header Section */}
      <div className="p-4 flex items-center justify-between bg-muted/30">
        <div className="flex flex-col gap-1">
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

        <div className="flex items-center gap-6">
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
        </div>
      </div>

      {/* Codec Test Output Section */}
      <div className="bg-black/90 p-3 font-mono text-xs text-green-500/80 border-t overflow-hidden">
        <div className="flex items-center gap-2 mb-2 text-muted-foreground uppercase tracking-wider text-[10px] font-bold">
          <FileText className="w-3 h-3" />
          Decoded Action Log (Codec Test)
        </div>
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {decodedLog}
        </div>
      </div>
    </Card>
  );
}

export function HandHistoryList({
  hands,
  currentUserId,
}: HandHistoryListProps) {
  if (!hands || hands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center border rounded-lg bg-card/50 text-muted-foreground">
        <p className="text-lg font-medium">No hands recorded</p>
        <p>Play some games to see your history here.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[600px] w-full rounded-md border p-4">
      <div className="space-y-6">
        {hands.map((hand) => (
          <HandCard key={hand.id} hand={hand} currentUserId={currentUserId} />
        ))}
      </div>
    </ScrollArea>
  );
}

"use client";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { Trophy, Clock, Coins } from "lucide-react";

interface HandSummary {
  id: string;
  game_id: string;
  hand_index: number;
  final_pot: number;
  winner_id: string | null;
  played_at: string;
}

interface HandHistoryListProps {
  hands: HandSummary[];
  currentUserId: string;
}

export function HandHistoryList({ hands, currentUserId }: HandHistoryListProps) {
  if (!hands || hands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3 text-center border rounded-lg bg-card/50 text-muted-foreground">
        <p className="text-lg font-medium">No hands recorded</p>
        <p>Play some games to see your history here.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px] w-full rounded-md border p-4">
      <div className="space-y-4">
        {hands.map((hand) => {
          const isWinner = hand.winner_id === currentUserId;
          
          return (
            <Card 
              key={hand.id} 
              className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer group"
              onClick={() => console.log("Replay Viewer coming soon: ", hand.id)}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-primary">#{hand.hand_index}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(hand.played_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate w-32 font-mono">
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
                    <span className="text-sm text-muted-foreground font-medium">Played</span>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </ScrollArea>
  );
}


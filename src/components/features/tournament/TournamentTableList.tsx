"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table2, Users, Coins, Eye, Loader2 } from "lucide-react";
import { TournamentTableInfo, TablePlayer } from "@/lib/types/tournament";

interface TournamentTableListProps {
  tables: TournamentTableInfo[];
  currentUserId: string | null;
  myTableId: string | null;
  canSpectate: boolean;
  onSpectate: (tableId: string) => void;
  isSpectating?: string | null;
}

export function TournamentTableList({
  tables,
  currentUserId,
  myTableId,
  canSpectate,
  onSpectate,
  isSpectating,
}: TournamentTableListProps) {
  // Sort tables by index
  const sortedTables = [...tables].sort((a, b) => {
    const indexA = a.tournamentTableIndex ?? 0;
    const indexB = b.tournamentTableIndex ?? 0;
    return indexA - indexB;
  });

  // Calculate stats for each table
  const getTableStats = (table: TournamentTableInfo) => {
    let playerCount = 0;
    let totalChips = 0;

    if (typeof table.players === "number") {
      playerCount = table.players;
    } else if (Array.isArray(table.players)) {
      playerCount = table.players.length;
      totalChips = (table.players as TablePlayer[]).reduce(
        (sum, p) => sum + (p.chips || 0),
        0
      );
    }

    if (table.playerCount !== undefined) {
      playerCount = table.playerCount;
    }

    const maxPlayers = table.maxPlayers || 9;
    const avgStack = playerCount > 0 ? Math.round(totalChips / playerCount) : 0;

    return { playerCount, maxPlayers, totalChips, avgStack };
  };

  if (tables.length === 0) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-8 text-center">
          <Table2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No active tables</p>
          <p className="text-slate-500 text-sm mt-1">
            Tables will appear once the tournament starts
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Table2 className="h-4 w-4" />
          Active Tables ({tables.length})
        </h2>
        {!canSpectate && myTableId && (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-400/30">
            Playing at Table
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedTables.map((table, i) => {
          const stats = getTableStats(table);
          const isMyTable = table.tableId === myTableId;
          const tableIndex =
            table.tournamentTableIndex !== undefined
              ? table.tournamentTableIndex + 1
              : i + 1;

          return (
            <Card
              key={table.tableId}
              className={`bg-slate-800/50 border-slate-700 transition-colors ${
                isMyTable
                  ? "ring-1 ring-blue-500/50 bg-blue-500/5"
                  : "hover:bg-slate-800/70"
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-lg ${
                        isMyTable
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-slate-700/50 text-slate-400"
                      }`}
                    >
                      <Table2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">
                        Table {tableIndex}
                      </h3>
                      {isMyTable && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 text-blue-400 border-blue-400/30 mt-0.5"
                        >
                          Your Table
                        </Badge>
                      )}
                    </div>
                  </div>

                  {canSpectate && !isMyTable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSpectate(table.tableId)}
                      disabled={isSpectating === table.tableId}
                      className="text-xs h-8"
                    >
                      {isSpectating === table.tableId ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Eye className="h-3 w-3 mr-1" />
                      )}
                      Spectate
                    </Button>
                  )}

                  {!canSpectate && !isMyTable && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-slate-700/50 text-slate-400"
                    >
                      Active players cannot spectate
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-slate-500" />
                    <span className="text-slate-300">
                      {stats.playerCount}
                      <span className="text-slate-500">/{stats.maxPlayers}</span>
                    </span>
                    <span className="text-slate-500 text-xs">players</span>
                  </div>

                  {stats.avgStack > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Coins className="h-4 w-4 text-slate-500" />
                      <span className="text-slate-300">
                        {stats.avgStack.toLocaleString()}
                      </span>
                      <span className="text-slate-500 text-xs">avg</span>
                    </div>
                  )}
                </div>

                {table.isPaused && (
                  <Badge
                    variant="outline"
                    className="mt-2 text-xs text-amber-400 border-amber-400/30"
                  >
                    Paused
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

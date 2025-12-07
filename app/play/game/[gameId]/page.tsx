"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/PokerTable";
import { ActionPopup } from "@/components/ActionPopup";
import { GameState, ActionType } from "@/lib/poker-game/ui/legacyTypes";
import { getSocket } from "@/lib/socketClient";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | null>(null);
  const [isHeadsUp, setIsHeadsUp] = useState(false);
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const timeoutIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const supabase = createClientComponentClient();

  // Redirect local games to the local game page
  useEffect(() => {
    if (gameId.startsWith("local-")) {
      router.replace(`/play/local/${gameId}`);
      return;
    }
  }, [gameId, router]);

  // Multiplayer game: Subscribe to games table, connect socket when game is created
  useEffect(() => {
    // Don't process if this is a local game (will be redirected)
    if (gameId.startsWith("local-")) return;

    let mounted = true;
    let socket: any = null;
    let gamesChannel: any = null;

    const setupGame = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/");
          return;
        }

        setCurrentUserId(user.id);

        // Check if game exists and get status
        const { data: game, error: gameError } = await supabase
          .from("games")
          .select("id, status, players, game_type")
          .eq("id", gameId)
          .single();

        if (gameError || !game) {
          console.error("[Game] Game not found:", gameError);
          router.push("/play");
          return;
        }

        setGameStatus(game.status);

        // Check if user is in game
        if (game.players && Array.isArray(game.players)) {
          const isPlayer = game.players.some((p: any) => p.id === user.id);
          if (!isPlayer) {
            console.error("[Game] User not in game");
            router.push("/play");
            return;
          }
        }

        // Detect heads-up mode
        if (
          game.game_type === "heads_up" ||
          (game.players && game.players.length === 2)
        ) {
          setIsHeadsUp(true);
        }

        // If game status is "starting", connect socket
        if (game.status === "starting" || game.status === "active") {
          connectSocket(user.id);
        }

        // Subscribe to game status changes via Realtime
        gamesChannel = supabase
          .channel(`game-${gameId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "games",
              filter: `id=eq.${gameId}`,
            },
            async (payload) => {
              if (!mounted) return;

              const updatedGame = payload.new as any;
              setGameStatus(updatedGame.status);

              // If game status changes to "starting" or "active", connect socket
              if (
                (updatedGame.status === "starting" ||
                  updatedGame.status === "active") &&
                !socket
              ) {
                connectSocket(user.id);
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error("[Game] Error setting up game:", err);
        if (mounted) {
          router.push("/play");
        }
      }
    };

    const connectSocket = async (userId: string) => {
      if (socket) return; // Already connected

      socket = getSocket();

      // Connect socket
      if (!socket.connected) {
        socket.connect();
      }

      // Wait for connection
      const onConnect = () => {
        if (mounted) {
          console.log("[Game] Socket connected, joining game:", gameId);
          socket.emit("joinGame", gameId);
        }
      };

      if (socket.connected) {
        onConnect();
      } else {
        socket.once("connect", onConnect);
      }

      // Listen for game state
      socket.on("gameState", (state: GameState) => {
        if (mounted) {
          console.log("[Game] 📊 Game state received:", state);

          // Normalize pots from server format to UI format
          // Server sends: pots: [{ amount: 3, eligiblePlayers: [...] }]
          // UI expects: pot: number, sidePots: [{ amount: number, eligibleSeats: number[] }]
          let mainPot = 0;
          let sidePots: Array<{ amount: number; eligibleSeats: number[] }> = [];

          if ((state as any).pots && Array.isArray((state as any).pots)) {
            const potsArray = (state as any).pots;
            if (potsArray.length > 0) {
              mainPot = potsArray[0]?.amount || 0;
              // Convert eligiblePlayers (UUIDs) to eligibleSeats (seat numbers)
              sidePots = potsArray.slice(1).map((pot: any) => ({
                amount: pot?.amount || 0,
                eligibleSeats: (pot?.eligiblePlayers || [])
                  .map((playerId: string) => {
                    const player = state.players?.find(
                      (p: any) => p.id === playerId
                    );
                    return player?.seat || 0;
                  })
                  .filter((seat: number) => seat > 0),
              }));
            }
          } else {
            // Fallback: use pot and sidePots if they exist directly
            mainPot = typeof state.pot === "number" ? state.pot : 0;
            sidePots = Array.isArray(state.sidePots) ? state.sidePots : [];
          }

          // Normalize game state
          const normalizedState: GameState = {
            ...state,
            // Set pot and sidePots from normalized values
            pot: mainPot,
            sidePots: sidePots,
            // Community cards should be an array of strings (e.g., ["2h", "9d"])
            communityCards: Array.isArray(state.communityCards)
              ? state.communityCards.filter(
                  (c): c is string => typeof c === "string"
                )
              : [],
            betsThisRound: Array.isArray(state.betsThisRound)
              ? state.betsThisRound
              : state.players?.map((p) => p.betThisRound || 0) || [],
            players:
              state.players?.map((p: any) => ({
                ...p,
                // Handle both betThisRound and currentBet (server might use either)
                betThisRound: p.betThisRound ?? p.currentBet ?? 0,
                // Hole cards should be an array of strings (e.g., ["2h", "9d"])
                holeCards: Array.isArray(p.holeCards)
                  ? p.holeCards.filter(
                      (c: any): c is string => typeof c === "string"
                    )
                  : [],
              })) || [],
          };

          setGameState(normalizedState);
        }
      });

      // Listen for timeout updates
      socket.on("timeout", (data: { seconds: number }) => {
        if (mounted) {
          setTimeoutSeconds(data.seconds);

          if (timeoutIntervalRef.current) {
            clearInterval(timeoutIntervalRef.current);
          }

          timeoutIntervalRef.current = setInterval(() => {
            setTimeoutSeconds((prev) => {
              if (prev === null || prev <= 1) {
                if (timeoutIntervalRef.current) {
                  clearInterval(timeoutIntervalRef.current);
                  timeoutIntervalRef.current = null;
                }
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
      });

      // Listen for disconnect
      socket.on("disconnect", () => {
        if (mounted) {
          setIsDisconnected(true);
        }
      });

      // Listen for reconnect
      socket.on("connect", () => {
        if (mounted) {
          setIsDisconnected(false);
          socket.emit("joinGame", gameId);
        }
      });

      // Listen for game-reconnected
      socket.on(
        "game-reconnected",
        (data: { gameId: string; message?: string }) => {
          if (mounted) {
            console.log("[Game] ✅ Auto-reconnected to game:", data.gameId);
            setIsDisconnected(false);
          }
        }
      );

      // Listen for navigate events
      socket.on("navigate", (data: { path: string }) => {
        if (mounted) {
          router.push(data.path);
        }
      });

      // Listen for errors
      socket.on("error", (error: { error?: string; message?: string }) => {
        if (mounted) {
          const errorMessage =
            error.error || error.message || "An error occurred";
          console.error("[Game] Socket error:", errorMessage);

          if (errorMessage.includes("Game not found")) {
            router.push("/play");
          } else if (errorMessage.includes("Not a player in this game")) {
            router.push("/play");
          }
        }
      });
    };

    setupGame();

    // Cleanup
    return () => {
      mounted = false;
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current);
      }
      if (gamesChannel) {
        gamesChannel.unsubscribe();
      }
      if (socket) {
        socket.off("gameState");
        socket.off("timeout");
        socket.off("disconnect");
        socket.off("connect");
        socket.off("game-reconnected");
        socket.off("navigate");
        socket.off("error");
        socket.emit("leaveGame", gameId);
      }
    };
  }, [gameId, router, supabase]);

  const handleAction = (action: ActionType, amount?: number) => {
    if (!gameState || !currentUserId) return;

    const socket = getSocket();
    const player = gameState.players.find((p) => p.id === currentUserId);

    socket.emit("action", {
      gameId,
      type: action,
      amount,
      seat: player?.seat,
    });
  };

  if (!gameState || !currentUserId) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
        <div>
          {gameStatus === "starting"
            ? "Waiting for all players to connect..."
            : "Connecting to game..."}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-hidden bg-poker-felt">
      {/* Disconnect Banner */}
      {isDisconnected && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 max-w-md bg-yellow-500/90 border-2 border-yellow-600 rounded-lg p-4 flex items-center gap-2 text-yellow-900">
          <WifiOff className="h-4 w-4" />
          <span>You disconnected. Reconnecting...</span>
          <Wifi className="h-4 w-4 animate-pulse ml-auto" />
        </div>
      )}

      {/* Timeout Countdown */}
      {timeoutSeconds !== null && timeoutSeconds > 0 && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-md bg-red-500/90 border-2 border-red-600 rounded-lg p-4 flex items-center gap-2 text-red-50">
          <AlertCircle className="h-4 w-4" />
          <span>
            Time remaining: <span className="font-bold">{timeoutSeconds}s</span>{" "}
            - Auto-folding soon
          </span>
        </div>
      )}

      {/* Multiplayer leave button - positioned absolutely at top */}
      <div className="absolute top-4 left-4 z-50">
        <Button variant="outline" onClick={() => router.push("/play")}>
          Leave Game
        </Button>
      </div>

      {/* Table container - centered vertically and horizontally */}
      <div className="h-full w-full flex items-center justify-center">
        <PokerTable
          gameState={gameState}
          currentUserId={currentUserId}
          playerNames={undefined}
          isLocalGame={false}
          isHeadsUp={isHeadsUp}
        />
      </div>

      {/* Action Popup */}
      <ActionPopup
        gameState={gameState}
        currentUserId={currentUserId}
        onAction={handleAction}
        isLocalGame={false}
      />
    </div>
  );
}

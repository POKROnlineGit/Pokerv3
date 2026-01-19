"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/features/game/PokerTable";
import { ActionPopup } from "@/components/features/game/ActionPopup";
import { LeaveGameButton } from "@/components/features/game/LeaveGameButton";
import { HandRankingsSidebar } from "@/components/features/game/HandRankingsSidebar";
import { PlayLayout } from "@/components/layout/PlayLayout";
import { GameState, ActionType, Player } from "@/lib/types/poker";
import { getClientHandStrength } from "@backend/domain/evaluation/ClientHandEvaluator";
import { getSocket, disconnectSocket } from "@/lib/api/socket/client";
import type { Socket } from "socket.io-client";
import { createClientComponentClient } from "@/lib/api/supabase/client";
import { useToast } from "@/lib/hooks";
import { useStatus } from "@/components/providers/StatusProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.gameId as string;

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); // Track when we're syncing authoritative state
  const [isInitializing, setIsInitializing] = useState(true); // Track initial game table initialization
  const [timeoutSeconds, setTimeoutSeconds] = useState<number | null>(null);
  const [isHeadsUp, setIsHeadsUp] = useState(false);
  // Game finished modal with full payload structure
  interface GameFinishedPayload {
    reason: string;
    winnerId: string | null;
    returnUrl: string;
    timestamp: string;
    stats?: {
      totalHands: number;
      startingStacks: { [playerId: string]: number };
      finalStacks: { [playerId: string]: number };
      chipChanges: { [playerId: string]: number };
      stackHistoryByPlayer: {
        [playerId: string]: {
          [hand: number]: number;
        };
      };
    };
  }
  const [gameFinished, setGameFinished] = useState<GameFinishedPayload | null>(
    null
  );
  const [playerDisconnectTimers, setPlayerDisconnectTimers] = useState<
    Record<string, number>
  >({}); // Track disconnect countdowns per player
  const [turnTimer, setTurnTimer] = useState<{
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null>(null); // Turn timer data from turn_timer_started event
  const [variantInfo, setVariantInfo] = useState<{
    name?: string;
    maxPlayers?: number;
    smallBlind?: number;
    bigBlind?: number;
    buyIn?: number;
    startingStack?: number;
    engineType?: string;
  } | null>(null);
  const [showHandRankings, setShowHandRankings] = useState(false);
  const [cardsLoaded, setCardsLoaded] = useState(false);

  // Calculate current hand strength for highlighting in sidebar
  const currentHandStrength = useMemo(() => {
    if (!gameState || !currentUserId) return null;
    const heroPlayer = gameState.players.find(
      (p: Player) => p.id === currentUserId
    );
    if (
      !heroPlayer ||
      !heroPlayer.holeCards ||
      heroPlayer.holeCards.length < 2
    ) {
      return null;
    }

    const holeCards = heroPlayer.holeCards.filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );
    const communityCards = (gameState.communityCards || []).filter(
      (c: string | "HIDDEN" | null): c is string => c !== null && c !== "HIDDEN"
    );

    if (holeCards.length < 2) {
      return null;
    }

    try {
      return getClientHandStrength(holeCards, communityCards);
    } catch (error) {
      console.error("Error calculating hand strength:", error);
      return null;
    }
  }, [gameState?.players, gameState?.communityCards, currentUserId]);
  const timeoutIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevPhaseRef = useRef<string | null>(null); // Track previous phase for disconnect detection
  const disconnectTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameEndedRef = useRef<boolean>(false); // Track if GAME_FINISHED received
  const handRunoutRef = useRef<boolean>(false); // Track if HAND_RUNOUT received
  const joinRetryCountRef = useRef<number>(0); // Track retry attempts for "Game not found" errors
  const joinRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track retry timeout
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const { setStatus, clearStatus } = useStatus();

  // Fetch variant information from database
  useEffect(() => {
    if (!gameId || gameId.startsWith("local-")) return;

    const fetchVariantInfo = async () => {
      try {
        // First, get game info from games table
        const { data: gameData, error: gameError } = await supabase
          .from("games")
          .select("game_type, small_blind, big_blind, buy_in")
          .eq("id", gameId)
          .single();

        if (gameError || !gameData) {
          console.error("Error fetching game data:", gameError);
          return;
        }

        // Then, fetch variant details from available_games
        const { data: variantData, error: variantError } = await supabase
          .from("available_games")
          .select("name, max_players, config, engine_type")
          .eq("slug", gameData.game_type)
          .single();

        if (variantError || !variantData) {
          console.error("Error fetching variant data:", variantError);
          return;
        }

        setVariantInfo({
          name: variantData.name,
          maxPlayers: variantData.max_players,
          smallBlind: gameData.small_blind,
          bigBlind: gameData.big_blind,
          buyIn: gameData.buy_in,
          startingStack:
            variantData.config?.startingStack || variantData.config?.buyIn,
          engineType: variantData.engine_type,
        });
      } catch (error) {
        console.error("Error fetching variant info:", error);
      }
    };

    fetchVariantInfo();
  }, [gameId, supabase]);

  // Preload card images for hand rankings
  useEffect(() => {
    if (!variantInfo?.engineType) return;

    // Check if it's holdem using engine_type
    const isHoldem = variantInfo.engineType === "holdem";

    if (!isHoldem) {
      setCardsLoaded(true); // No need to load cards if not holdem
      return;
    }

    // Cards needed for hand rankings
    const cards = [
      "Ah",
      "Kh",
      "Qh",
      "Jh",
      "Th",
      "9h",
      "8h",
      "7h",
      "6h",
      "5h",
      "Ac",
      "Ad",
      "As",
      "Kc",
      "Kd",
      "Qc",
      "Qd",
      "Qh",
      "9c",
      "8d",
      "7h",
      "6s",
      "5c",
      "3h",
      "9d",
      "6h",
    ];

    let loadedCount = 0;
    const totalCards = cards.length;

    if (totalCards === 0) {
      setCardsLoaded(true);
      return;
    }

    cards.forEach((card) => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalCards) {
          setCardsLoaded(true);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === totalCards) {
          setCardsLoaded(true);
        }
      };
      img.src = `/cards/${card}.png`;
    });
  }, [variantInfo?.engineType]);

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
    let socket: Socket | null = null;

    const connectSocket = async () => {
      if (socket) return; // Already connected

      socket = getSocket();

      // Connect socket
      if (!socket.connected) {
        socket.connect();
      }

      // Wait for connection
      const onConnect = () => {
        if (mounted) {
          // Reset retry count on fresh connection attempt
          joinRetryCountRef.current = 0;
          if (joinRetryTimeoutRef.current) {
            clearTimeout(joinRetryTimeoutRef.current);
            joinRetryTimeoutRef.current = null;
          }

          // On initial connect, (re)join this game room - server will automatically send gameState
          socket.emit("joinGame", gameId);
          setIsSyncing(true);
        }
      };

      if (socket.connected) {
        onConnect();
      } else {
        socket.once("connect", onConnect);
      }

      const handleGameEnded = (data: { message?: string; reason?: string }) => {
        if (!mounted) return;

        gameEndedRef.current = true;

        // Set game finished state - this will show the modal
        // Do NOT redirect immediately - user stays on table view
        const payload: GameFinishedPayload = {
          reason: data.reason || data.message || "GAME_ENDED",
          winnerId: null,
          returnUrl: "/play/online",
          timestamp: new Date().toISOString(),
        };
        setGameFinished(payload);
      };

      // Listen for game state
      socket.on("gameState", (state: GameState) => {
        if (mounted) {
          // Mark initialization complete - authoritative state received from server
          if (isInitializing) {
            setIsInitializing(false);
          }

          // Clear syncing state - connection is healthy and we have authoritative state
          setIsSyncing(false);

          // Reset retry count on successful game state reception
          if (joinRetryCountRef.current > 0) {
            joinRetryCountRef.current = 0;
            if (joinRetryTimeoutRef.current) {
              clearTimeout(joinRetryTimeoutRef.current);
              joinRetryTimeoutRef.current = null;
            }
          }
          // Clear turn timer if action is no longer being awaited
          // When a new gameState arrives, it means the previous action has been processed
          // If there's an active timer, clear it unless the timer is still valid (same seat still acting)
          setTurnTimer((prevTimer) => {
            if (!prevTimer) return null; // No timer to clear

            // If currentActorSeat is null, no one is acting - clear timer
            if (
              state.currentActorSeat === null ||
              state.currentActorSeat === undefined
            ) {
              return null;
            }

            // If currentActorSeat changed to a different seat, clear the old timer
            if (state.currentActorSeat !== prevTimer.activeSeat) {
              return null;
            }

            // Timer is still valid (same seat still acting)
            return prevTimer;
          });

          // Reset flags if we get a new hand (handNumber changed)
          if (gameState && state.handNumber !== gameState.handNumber) {
            gameEndedRef.current = false;
            handRunoutRef.current = false;
          }

          // CRITICAL: Fully replace local state on every gameState event
          // This ensures we always have the latest server state, even if phase reverts
          // (e.g., Flop → Waiting due to player leaving)

          // Normalize pots from server format to UI format
          // Server sends: pots: [{ amount: 3, eligiblePlayers: [...] }]
          // UI expects: pot: number, sidePots: [{ amount: number, eligibleSeats: number[] }]
          let mainPot = 0;
          let sidePots: Array<{ amount: number; eligibleSeats: number[] }> = [];

          if (state.pots && Array.isArray(state.pots)) {
            const potsArray = state.pots;
            if (potsArray.length > 0) {
              mainPot = potsArray[0]?.amount || 0;
              // Convert eligiblePlayers (UUIDs) to eligibleSeats (seat numbers)
              sidePots = potsArray.slice(1).map((pot) => ({
                amount: pot?.amount || 0,
                eligibleSeats: (pot?.eligiblePlayers || [])
                  .map((playerId: string) => {
                    const player = state.players?.find((p) => p.id === playerId);
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

          // Detect actual phase from server (may be "waiting")
          const serverPhase = state.currentPhase || "preflop";
          const isWaitingPhase = serverPhase === "waiting";

          // BLOCK WAITING TRANSITION DURING ACTIVE HAND
          // Safety layer: If server sends WAITING_FOR_PLAYERS but we have cards/chips in pot,
          // ignore the waiting state and keep the current active state
          const hasActiveHand =
            (state.communityCards && state.communityCards.length > 0) ||
            mainPot > 0 ||
            (state.players &&
              state.players.some(
                (p: Player) =>
                  (p.holeCards && p.holeCards.length > 0) ||
                  (p.currentBet && p.currentBet > 0)
              ));

          // If we have an active hand, block waiting transition
          const shouldBlockWaiting = hasActiveHand && isWaitingPhase;

          if (shouldBlockWaiting && mounted) {
            // Don't update phase to waiting - keep current active state
            // The game will end via GAME_FINISHED event instead
          }

          // Update previous phase ref (only if not blocking waiting)
          if (!shouldBlockWaiting) {
            prevPhaseRef.current = isWaitingPhase
              ? "waiting"
              : (serverPhase as string);
          }

          // Safety: Ensure all required fields exist, even if server sends incomplete data
          // This prevents crashes when phase reverts (e.g., Flop → Waiting)
          const normalizedState: GameState & { currentPhase?: string } = {
            gameId: state.gameId || gameId,
            // Ensure players array exists and is valid
            players: Array.isArray(state.players)
              ? state.players.map((p) => ({
                  id: p.id || "",
                  username: p.username || `Player ${p.seat || ""}`,
                  seat: p.seat || 0,
                  chips: typeof p.chips === "number" ? p.chips : 0,
                  currentBet: p.currentBet || 0,
                  totalBet: p.totalBet ?? p.totalBetThisHand ?? 0,
                  holeCards: Array.isArray(p.holeCards)
                    ? p.holeCards.filter(
                        (c: unknown): c is string => typeof c === "string"
                      )
                    : [],
                  folded: Boolean(p.folded),
                  allIn: Boolean(p.allIn),
                  isBot: Boolean(p.isBot),
                  leaving: Boolean(p.leaving),
                  playerHandType: p.playerHandType,
                  revealedIndices: Array.isArray(p?.revealedIndices)
                    ? p.revealedIndices
                    : [],
                  // Preserve disconnected/ghost state from previous state if not explicitly updated
                  disconnected: p.disconnected ?? false,
                  left: p.left ?? false,
                  isGhost: p.isGhost ?? p.disconnected ?? false,
                  disconnectTimestamp: p.disconnectTimestamp,
                  status: p.status,
                }))
              : [],
            // Ensure communityCards is always an array
            // DO NOT clear cards/pot if blocking waiting transition (active hand)
            communityCards: shouldBlockWaiting
              ? Array.isArray(state.communityCards)
                ? state.communityCards.filter(
                    (c): c is string => typeof c === "string"
                  )
                : []
              : isWaitingPhase
              ? [] // Clear community cards when waiting (only if no active hand)
              : Array.isArray(state.communityCards)
              ? state.communityCards.filter(
                  (c): c is string => typeof c === "string"
                )
              : [],
            pot: shouldBlockWaiting ? mainPot : isWaitingPhase ? 0 : mainPot, // Preserve pot if blocking waiting
            sidePots: shouldBlockWaiting
              ? sidePots
              : isWaitingPhase
              ? []
              : sidePots, // Preserve side pots if blocking waiting
            buttonSeat:
              typeof state.buttonSeat === "number" ? state.buttonSeat : 1,
            sbSeat: typeof state.sbSeat === "number" ? state.sbSeat : 1,
            bbSeat: typeof state.bbSeat === "number" ? state.bbSeat : 2,
            // Map phase, handle phase reversals safely
            // If blocking waiting, preserve current phase from previous state
            currentPhase: shouldBlockWaiting
              ? gameState?.currentPhase || state.currentPhase || "preflop"
              : isWaitingPhase
              ? "preflop" // Map "waiting" to "preflop" for UI (adapter does this too)
              : state.currentPhase ||
                (serverPhase === "waiting"
                  ? "preflop"
                  : (serverPhase as GameState["currentPhase"])) ||
                "preflop",
            currentActorSeat:
              typeof state.currentActorSeat === "number"
                ? state.currentActorSeat
                : null,
            minRaise: typeof state.minRaise === "number" ? state.minRaise : 2,
            lastRaiseAmount:
              typeof state.lastRaiseAmount === "number"
                ? state.lastRaiseAmount
                : undefined,
            betsThisRound: Array.isArray(state.betsThisRound)
              ? state.betsThisRound
              : [],
            handNumber:
              typeof state.handNumber === "number" ? state.handNumber : 0,
            // Map Game Constraints: Ensure bigBlind and smallBlind are available to UI (ActionPopup needs these)
            bigBlind:
              typeof state.bigBlind === "number"
                ? state.bigBlind
                : state.config?.bigBlind ||
                  2,
            smallBlind:
              typeof state.smallBlind === "number"
                ? state.smallBlind
                : state.config?.smallBlind ||
                  1,
            // Calculate highBet from players if not directly available
            highBet:
              typeof state.highBet === "number"
                ? state.highBet
                : state.players?.length > 0
                ? Math.max(
                    ...state.players.map((p: Player) => p.currentBet || 0),
                    0
                  )
                : 0,
            // Preserve left_players if server sends it (for visual feedback)
            ...(state.left_players && {
              left_players: state.left_players,
            }),
          };

          // Fully replace state - no merging, no partial updates
          // This ensures UI always reflects server state exactly
          setGameState(normalizedState);

          // Detect heads-up mode from gameState (memory-authoritative)
          if (normalizedState.players && normalizedState.players.length === 2) {
            setIsHeadsUp(true);
          } else if (
            normalizedState.players &&
            normalizedState.players.length > 2
          ) {
            setIsHeadsUp(false);
          }
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
          setIsSyncing(true);
        }
      });

      // Listen for reconnect
      socket.on("connect", () => {
        if (mounted) {
          setIsDisconnected(false);
          // Reset retry count on reconnect
          joinRetryCountRef.current = 0;
          if (joinRetryTimeoutRef.current) {
            clearTimeout(joinRetryTimeoutRef.current);
            joinRetryTimeoutRef.current = null;
          }
          // On reconnect, ensure we (re)join this game - server will automatically send gameState
          socket.emit("joinGame", gameId);
          setIsSyncing(true);
        }
      });

      // Listen for game-reconnected
      socket.on(
        "game-reconnected",
        (data: { gameId: string; message?: string }) => {
          if (mounted) {
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

      socket.on("gameEnded", handleGameEnded);

      // ============================================
      // GHOST STATES & RUNOUT ANIMATIONS HANDLERS
      // ============================================

      // 1. PLAYER_STATUS_UPDATE: Handle DISCONNECTED vs LEFT statuses
      socket.on(
        "PLAYER_STATUS_UPDATE",
        (data: {
          playerId: string;
          status: string;
          action?: string;
          timestamp?: number;
        }) => {
          if (!mounted) return;

          if (
            data.status === "DISCONNECTED" ||
            data.status === "LEFT" ||
            data.status === "REMOVED"
          ) {
            // Get player info from current state for toast (before server updates)
            const player = gameState?.players.find(
              (p) => p.id === data.playerId
            );

            // Start disconnect countdown timer (60 seconds) - only for DISCONNECTED
            if (data.status === "DISCONNECTED" && data.timestamp) {
              const disconnectTime = data.timestamp;
              const countdownDuration = 60000; // 60 seconds
              const endTime = disconnectTime + countdownDuration;

              setPlayerDisconnectTimers((prev) => ({
                ...prev,
                [data.playerId]: endTime,
              }));

              // Update countdown every second
              if (disconnectTimerIntervalRef.current) {
                clearInterval(disconnectTimerIntervalRef.current);
              }
              disconnectTimerIntervalRef.current = setInterval(() => {
                setPlayerDisconnectTimers((prev) => {
                  const updated = { ...prev };
                  const now = Date.now();
                  Object.keys(updated).forEach((playerId) => {
                    if (updated[playerId] <= now) {
                      delete updated[playerId];
                    }
                  });
                  return updated;
                });
              }, 1000);
            }

            // Clear disconnect timer if player left or was removed
            if (data.status === "LEFT" || data.status === "REMOVED") {
              setPlayerDisconnectTimers((prev) => {
                const updated = { ...prev };
                delete updated[data.playerId];
                return updated;
              });
            }

            // Show toast notification
            toast({
              title:
                data.status === "LEFT" || data.status === "REMOVED"
                  ? data.status === "REMOVED"
                    ? "Player removed"
                    : "Player left"
                  : "Player disconnected",
              description:
                data.status === "LEFT" || data.status === "REMOVED"
                  ? data.status === "REMOVED"
                    ? `${
                        player?.username || "A player"
                      } was removed by the host`
                    : `${player?.username || "A player"} has left the game`
                  : `${player?.username || "A player"} disconnected${
                      data.action === "FOLD" ? " and folded" : ""
                    }`,
              variant: "default",
            });

            // Let the server's gameState updates handle all state changes
            // This ensures usernames and all player data are correctly normalized
          }
        }
      );

      // 2. HAND_RUNOUT: Handle hand completion
      socket.on(
        "HAND_RUNOUT",
        (data: { winnerId: string; board: string[] }) => {
          if (!mounted) return;

          handRunoutRef.current = true; // Mark that runout has occurred

          // Update board state - PokerTable will detect new cards and animate them automatically
          const finalBoard = data.board || [];
          setGameState((prevState) => {
            if (!prevState) return prevState;

            const winner = prevState.players.find(
              (p) => p.id === data.winnerId
            );

            // Show winner notification
            toast({
              title: "Hand complete",
              description: `${winner?.username || "Player"} wins the pot!`,
              variant: "default",
            });

            return {
              ...prevState,
              communityCards: finalBoard,
            };
          });
        }
      );

      // 3. SEAT_VACATED: Remove player from UI (only event that removes player)
      socket.on("SEAT_VACATED", (data: { seatIndex: number }) => {
        if (!mounted) return;

        setGameState((prevState) => {
          if (!prevState) return prevState;

          // Remove player at the specified seat
          const updatedPlayers = prevState.players.filter(
            (player) => player.seat !== data.seatIndex
          );

          return {
            ...prevState,
            players: updatedPlayers,
          };
        });

        toast({
          title: "Seat vacated",
          description: "A player has left the table",
          variant: "default",
        });
      });

      // 4. TURN_TIMER_STARTED: Handle turn countdown timer
      socket.on(
        "turn_timer_started",
        (data: { deadline: number; duration: number; activeSeat: number }) => {
          if (!mounted) {
            return;
          }

          const now = Date.now();
          const timeUntilDeadline = data.deadline - now;

          // Validate deadline is not in the past
          if (timeUntilDeadline < 0) {
            console.error("[Game] ⏱️ ERROR: Timer deadline is in the past!", {
              deadline: data.deadline,
              now,
              difference: timeUntilDeadline,
              deadlineDate: new Date(data.deadline).toISOString(),
              nowDate: new Date(now).toISOString(),
            });
          }

          const timerData = {
            deadline: data.deadline,
            duration: data.duration,
            activeSeat: data.activeSeat,
          };

          setTurnTimer(timerData);
        }
      );

      // 5. DEAL_STREET: Handle street dealing during normal gameplay and runouts
      // Backend now explicitly emits DEAL_STREET during normal transitions (Flop/Turn/River)
      socket.on(
        "DEAL_STREET",
        (data: {
          cards: string[];
          round: string;
          communityCards: string[];
        }) => {
          if (!mounted) return;

          // CRITICAL: Force hide action controls and clear any stale betting UI

          // Update board state immediately - server controls timing (2s intervals)
          // PokerTable will detect new cards and animate them automatically
          setGameState((prevState) => {
            if (!prevState) return prevState;

            return {
              ...prevState,
              communityCards: data.communityCards || prevState.communityCards,
              currentPhase:
                data.round === "flop"
                  ? "flop"
                  : data.round === "turn"
                  ? "turn"
                  : data.round === "river"
                  ? "river"
                  : prevState.currentPhase,
            };
          });

          // Cards will be animated automatically by PokerTable's self-contained animation system
        }
      );

      // 5. PLAYER_ELIMINATED: Handle individual player eliminations
      socket.on("PLAYER_ELIMINATED", (data: { playerId: string }) => {
        if (!mounted) return;

        if (data.playerId === currentUserId) {
          // Current user was eliminated - show game over modal
          setGameFinished({
            reason: "You have been eliminated",
            winnerId: null,
            returnUrl: "/play/online",
            timestamp: new Date().toISOString(),
            stats: undefined,
          });
        } else {
          // Another player was eliminated - show toast notification
          const eliminatedPlayer = gameState?.players.find(
            (p) => p.id === data.playerId
          );
          toast({
            title: "Player eliminated",
            description: `${
              eliminatedPlayer?.username || "A player"
            } has been eliminated`,
            variant: "default",
          });
        }
      });

      // 6. GAME_FINISHED: Show modal when game ends (DO NOT redirect immediately)
      // Listen specifically for 'GAME_FINISHED' event (backend sends this exact string)
      socket.on(
        "GAME_FINISHED",
        (data: {
          gameId?: string;
          reason?: string;
          message?: string;
          payload?: GameFinishedPayload;
          winnerId?: string | null;
          returnUrl?: string;
          timestamp?: string;
          stats?: GameFinishedPayload["stats"];
        }) => {
          if (!mounted) return;

          gameEndedRef.current = true; // Mark that game has ended

          // Extract payload - backend may send directly or nested in payload
          const payload: GameFinishedPayload = data.payload || {
            reason: data.reason || data.message || "The game has ended.",
            winnerId: data.winnerId ?? null,
            returnUrl: data.returnUrl || "/play/online",
            timestamp: data.timestamp || new Date().toISOString(),
            stats: data.stats,
          };

          // Set game finished state with full payload
          setGameFinished(payload);
        }
      );

      // Also listen for GAME_ENDED (alternative event name) for backward compatibility
      socket.on(
        "GAME_ENDED",
        (data: {
          reason?: string;
          message?: string;
          payload?: GameFinishedPayload;
          winnerId?: string | null;
          returnUrl?: string;
          timestamp?: string;
          stats?: GameFinishedPayload["stats"];
        }) => {
          if (!mounted) return;

          gameEndedRef.current = true;

          // Extract payload - backward compatibility with old format
          const payload: GameFinishedPayload = data.payload || {
            reason: data.reason || data.message || "The game has ended.",
            winnerId: data.winnerId ?? null,
            returnUrl: data.returnUrl || "/play/online",
            timestamp: data.timestamp || new Date().toISOString(),
            stats: data.stats,
          };

          setGameFinished(payload);
        }
      );

      // Listen for SYNC_GAME response (after reconnection)
      socket.on("SYNC_GAME", (state: GameState) => {
        if (!mounted) return;

        // Mark initialization complete - authoritative state received from server
        if (isInitializing) {
          setIsInitializing(false);
        }

        // Reset retry count on successful sync
        if (joinRetryCountRef.current > 0) {
          joinRetryCountRef.current = 0;
          if (joinRetryTimeoutRef.current) {
            clearTimeout(joinRetryTimeoutRef.current);
            joinRetryTimeoutRef.current = null;
          }
        }

        // Clear turn timer if action is no longer being awaited (same logic as gameState)
        setTurnTimer((prevTimer) => {
          if (!prevTimer) return null;

          if (
            state.currentActorSeat === null ||
            state.currentActorSeat === undefined
          ) {
            return null;
          }

          if (state.currentActorSeat !== prevTimer.activeSeat) {
            return null;
          }

          return prevTimer;
        });

        // Normalize and set state (same logic as gameState handler)
        // This clears any disconnect overlays
        const normalizedState: GameState & { currentPhase?: string } = {
          gameId: state.gameId || gameId,
          players: Array.isArray(state.players)
            ? state.players.map((p) => ({
                id: p.id || "",
                username: p.username || `Player ${p.seat || ""}`,
                seat: p.seat || 0,
                chips: typeof p.chips === "number" ? p.chips : 0,
                currentBet: p.currentBet || 0,
                totalBet: p.totalBet ?? p.totalBetThisHand ?? 0,
                holeCards: Array.isArray(p.holeCards)
                  ? p.holeCards.filter(
                      (c: unknown): c is string => typeof c === "string"
                    )
                  : [],
                folded: Boolean(p.folded),
                allIn: Boolean(p.allIn),
                isBot: Boolean(p.isBot),
                leaving: Boolean(p.leaving),
                playerHandType: p.playerHandType,
                revealedIndices: Array.isArray(p.revealedIndices)
                  ? p.revealedIndices
                  : [],
                disconnected: false, // Clear disconnect status on sync
                left: false,
                isGhost: false,
                status: p.status,
              }))
            : [],
          communityCards: Array.isArray(state.communityCards)
            ? state.communityCards.filter(
                (c): c is string => typeof c === "string"
              )
            : [],
          pot: typeof state.pot === "number" ? state.pot : 0,
          sidePots: Array.isArray(state.sidePots) ? state.sidePots : [],
          buttonSeat:
            typeof state.buttonSeat === "number" ? state.buttonSeat : 1,
          sbSeat: typeof state.sbSeat === "number" ? state.sbSeat : 1,
          bbSeat: typeof state.bbSeat === "number" ? state.bbSeat : 2,
          currentPhase: (state.currentPhase || "preflop") as
            | "preflop"
            | "flop"
            | "turn"
            | "river"
            | "showdown"
            | "waiting",
          currentActorSeat:
            typeof state.currentActorSeat === "number"
              ? state.currentActorSeat
              : null,
          minRaise: typeof state.minRaise === "number" ? state.minRaise : 2,
          lastRaiseAmount:
            typeof state.lastRaiseAmount === "number"
              ? state.lastRaiseAmount
              : undefined,
          betsThisRound: Array.isArray(state.betsThisRound)
            ? state.betsThisRound
            : [],
          handNumber:
            typeof state.handNumber === "number" ? state.handNumber : 0,
          // Map Game Constraints: Ensure bigBlind and smallBlind are available to UI (ActionPopup needs these)
          bigBlind:
            typeof state.bigBlind === "number"
              ? state.bigBlind
              : state.config?.bigBlind ||
                2,
          smallBlind:
            typeof state.smallBlind === "number"
              ? state.smallBlind
              : state.config?.smallBlind ||
                1,
          // Calculate highBet from players if not directly available
          highBet:
            typeof state.highBet === "number"
              ? state.highBet
              : state.players?.length > 0
              ? Math.max(...state.players.map((p) => p.currentBet || 0), 0)
              : 0,
        } as GameState;

        setGameState(normalizedState);

        // Detect heads-up mode from gameState (memory-authoritative)
        if (normalizedState.players && normalizedState.players.length === 2) {
          setIsHeadsUp(true);
        } else if (
          normalizedState.players &&
          normalizedState.players.length > 2
        ) {
          setIsHeadsUp(false);
        }

        // Clear disconnect timers
        setPlayerDisconnectTimers({});

        // Sync complete
        setIsSyncing(false);

        toast({
          title: "Reconnected",
          description: "Game state synchronized",
          variant: "default",
        });
      });

      // Listen for errors
      socket.on("error", (error: { error?: string; message?: string }) => {
        if (!mounted) return;

        const errorMessage =
          error.error || error.message || "An error occurred";
        console.error("[Game] Socket error:", errorMessage);

        if (errorMessage.includes("Game not found")) {
          // Graceful retry mechanism: retry joinGame up to 3 times with 500ms delay
          // This accounts for the brief window where DB record exists but server is still initializing
          const maxRetries = 3;
          const retryDelay = 500; // 500ms delay

          if (joinRetryCountRef.current < maxRetries) {
            joinRetryCountRef.current += 1;

            // Clear any existing retry timeout
            if (joinRetryTimeoutRef.current) {
              clearTimeout(joinRetryTimeoutRef.current);
            }

            // Wait 500ms, then retry joinGame only (server will handle state sync)
            joinRetryTimeoutRef.current = setTimeout(() => {
              if (!mounted) return;
              socket.emit("joinGame", gameId);
            }, retryDelay);
          } else {
            // All retries exhausted, redirect to lobby
            // Clear retry timeout if it exists
            if (joinRetryTimeoutRef.current) {
              clearTimeout(joinRetryTimeoutRef.current);
              joinRetryTimeoutRef.current = null;
            }
            // Reset retry count for future attempts
            joinRetryCountRef.current = 0;
            // Mark as unmounted to prevent state updates during redirect
            mounted = false;
            // Defer redirect to allow React to finish current render cycle
            setTimeout(() => {
              router.replace("/play/online");
            }, 0);
          }
        } else if (errorMessage.includes("Not a player in this game")) {
          // Show user-friendly error message
          toast({
            title: "Access Denied",
            description: "You are not a player in this game.",
            variant: "destructive",
          });

          // No retry for authorization errors - redirect immediately
          mounted = false;
          // Defer redirect to allow toast to show
          setTimeout(() => {
            router.replace("/play/online");
          }, 1500); // Give time for toast to be visible
        }
      });
    };

    const setupGame = async () => {
      try {
        // Only perform auth check - server will validate game access via socket
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // Mark as unmounted to prevent state updates during redirect
          if (mounted) {
            mounted = false;
            setTimeout(() => {
              router.replace("/");
            }, 0);
          }
          return;
        }

        setCurrentUserId(user.id);
        // Game validation and state will come from socket (memory-authoritative)
        // Server will handle JIT hydration and send gameState when ready
      } catch (err) {
        console.error("[Game] Error setting up game:", err, { gameId });
        if (mounted) {
          // Mark as unmounted to prevent state updates during redirect
          mounted = false;
          setTimeout(() => {
            router.replace("/play/online");
          }, 0);
        }
      }
    };

    // Kick off socket connection & listeners immediately (memory-authoritative)
    connectSocket();
    // Run Supabase validation in parallel
    setupGame();

    // Cleanup
    return () => {
      mounted = false;
      if (timeoutIntervalRef.current) {
        clearInterval(timeoutIntervalRef.current);
      }
      if (joinRetryTimeoutRef.current) {
        clearTimeout(joinRetryTimeoutRef.current);
        joinRetryTimeoutRef.current = null;
      }
      if (socket) {
        socket.off("gameState");
        socket.off("timeout");
        socket.off("disconnect");
        socket.off("connect");
        socket.off("game-reconnected");
        socket.off("navigate");
        socket.off("gameEnded");
        socket.off("PLAYER_STATUS_UPDATE");
        socket.off("HAND_RUNOUT");
        socket.off("SEAT_VACATED");
        socket.off("turn_timer_started");
        socket.off("DEAL_STREET");
        socket.off("GAME_FINISHED");
        socket.off("GAME_ENDED");
        socket.off("SYNC_GAME");
        socket.off("error");
        // Note: Do NOT emit leaveGame here - socket remains subscribed to game room
        // This allows the global listener in StatusProvider to detect active games
      }

      // Clear all timeouts
      if (disconnectTimerIntervalRef.current) {
        clearInterval(disconnectTimerIntervalRef.current);
      }

      // Reset retry count on unmount
      joinRetryCountRef.current = 0;
    };
  }, [gameId, router, supabase, toast]);

  // Status management: Disconnect
  useEffect(() => {
    if (isDisconnected) {
      setStatus({
        id: "game-disconnect",
        priority: 100,
        type: "error",
        title: "Connection Lost",
        message: "Reconnecting...",
      });
    } else {
      clearStatus("game-disconnect");
    }
  }, [isDisconnected, setStatus, clearStatus]);

  // Status management: Timeout
  useEffect(() => {
    if (timeoutSeconds !== null && timeoutSeconds > 0) {
      setStatus({
        id: "game-timeout",
        priority: 80,
        type: "warning",
        title: "Action Required",
        message: `Auto-folding in ${timeoutSeconds}s`,
      });
    } else {
      clearStatus("game-timeout");
    }
  }, [timeoutSeconds, setStatus, clearStatus]);

  // Status management: Waiting for opponent
  useEffect(() => {
    if (!gameState) {
      clearStatus("waiting");
      return;
    }

    const currentPhase = gameState.currentPhase || "preflop";
    const isWaitingPhase = currentPhase === "waiting";
    const activePlayerCount = gameState.players.filter(
      (p) => !p.folded && p.chips > 0 && !p.left
    ).length;

    if (isWaitingPhase && activePlayerCount < 2) {
      setStatus({
        id: "waiting",
        priority: 20,
        type: "info",
        title: "Waiting for opponent...",
        message: "Game paused until another player joins",
      });
    } else {
      clearStatus("waiting");
    }
  }, [gameState, setStatus, clearStatus]);

  const handleAction = (
    action: ActionType,
    amount?: number,
    isAllInCall?: boolean
  ) => {
    // Block actions if we don't have state, no user, or we're currently syncing
    if (!gameState || !currentUserId) return;

    const socket = getSocket();
    const player = gameState.players.find((p) => p.id === currentUserId);

    if (!player) {
      console.error("[Game] ❌ Cannot send action - player not found");
      return;
    }

    // Validate it's the player's turn before sending action
    const isMyTurn = gameState.currentActorSeat === player.seat;

    // Server will validate if it's the player's turn

    const payload = {
      gameId,
      type: action,
      amount,
      seat: player.seat,
      isAllInCall,
    };

    socket.emit("action", payload);
  };

  const handleRevealCard = (cardIndex: number) => {
    if (!gameState || !currentUserId) return;

    // Only allow revealing during showdown
    if (gameState.currentPhase !== "showdown") {
      return;
    }

    const socket = getSocket();
    const player = gameState.players.find((p) => p.id === currentUserId);

    if (!player) {
      console.error("[Game] ❌ Cannot reveal card - player not found");
      return;
    }

    // Emit reveal action
    const payload = {
      gameId,
      type: "reveal",
      index: cardIndex,
      seat: player.seat,
    };

    socket.emit("action", payload);
  };

  // Prepare table content
  const tableContent = (
    <>
      {isInitializing || !gameState || !currentUserId ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            {isInitializing
              ? "Initializing Game Table..."
              : !currentUserId
              ? "Authenticating..."
              : "Connecting to game..."}
          </div>
        </div>
      ) : (
        <>
          {/* Table container - centered vertically and horizontally */}
          <div className="h-full w-full flex items-center justify-center">
            <PokerTable
              gameState={gameState}
              currentUserId={currentUserId}
              onRevealCard={handleRevealCard}
              isLocalGame={false}
              isHeadsUp={isHeadsUp}
              playerDisconnectTimers={playerDisconnectTimers}
              turnTimer={turnTimer}
              isSyncing={isSyncing}
            />
          </div>

          {/* Hand Rankings Sidebar */}
          <HandRankingsSidebar
            isVisible={showHandRankings}
            isHoldem={variantInfo?.engineType === "holdem"}
            currentHandStrength={currentHandStrength}
          />
        </>
      )}
    </>
  );

  // Prepare action popup separately to render outside stacking context
  const actionPopupContent = !gameFinished ? (
    <ActionPopup
      gameState={gameState}
      currentUserId={currentUserId}
      onAction={handleAction}
      onRevealCard={handleRevealCard}
      isLocalGame={false}
    />
  ) : null;

  // Prepare sidebar content
  const sidebarContent = gameFinished ? (
    <div className="space-y-4">
      <Card className="bg-[hsl(222.2,84%,4.9%)]">
        <CardContent className="pt-6 space-y-4">
          {/* Winner Info - First */}
          {gameFinished.winnerId && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Winner</p>
              <p className="text-sm font-semibold">
                {gameFinished.winnerId === currentUserId
                  ? "You won!"
                  : gameState?.players.find(
                      (p) => p.id === gameFinished.winnerId
                    )?.username ||
                    "Player " + gameFinished.winnerId.slice(0, 8)}
              </p>
            </div>
          )}

          {/* Stats - After Winner */}
          {gameFinished.stats &&
            currentUserId &&
            gameFinished.stats.startingStacks[currentUserId] !== undefined && (
              <>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Hands Played</p>
                  <p className="text-sm font-semibold">
                    {gameFinished.stats.totalHands}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Final Stack</p>
                  <p className="text-sm font-semibold">
                    {gameFinished.stats?.finalStacks[
                      currentUserId
                    ]?.toLocaleString() || "0"}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Net Change</p>
                  <div className="flex items-center gap-1">
                    {gameFinished.stats.chipChanges[currentUserId] >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                    <p
                      className={`text-sm font-semibold ${
                        gameFinished.stats.chipChanges[currentUserId] >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      {gameFinished.stats.chipChanges[currentUserId] >= 0
                        ? "+"
                        : ""}
                      {gameFinished.stats.chipChanges[
                        currentUserId
                      ].toLocaleString()}
                    </p>
                  </div>
                </div>
              </>
            )}
        </CardContent>
      </Card>

      {/* Return to Lobby Button */}
      <Button
        onClick={() => {
          // Clean exit: disconnect socket and redirect
          const socket = getSocket();
          if (socket) {
            socket.removeAllListeners();
            disconnectSocket();
          }
          setGameFinished(null);
          router.push("/play");
        }}
        className="w-full"
      >
        Return to Lobby
      </Button>
    </div>
  ) : (
    <div className="space-y-4">
      {/* Match Info - No Card, matching local page styling */}
      <div className="space-y-2">
        {variantInfo?.name && (
          <div>
            <p className="text-xs text-muted-foreground">Variant</p>
            <p className="text-sm font-semibold">{variantInfo.name}</p>
          </div>
        )}
        {variantInfo?.smallBlind && variantInfo?.bigBlind && (
          <div>
            <p className="text-xs text-muted-foreground">Blinds</p>
            <p className="text-sm font-semibold">
              ${variantInfo.smallBlind}/${variantInfo.bigBlind}
            </p>
          </div>
        )}
        {variantInfo?.startingStack && (
          <div>
            <p className="text-xs text-muted-foreground">Starting Stack</p>
            <p className="text-sm font-semibold">
              {variantInfo.startingStack.toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Prepare footer content
  const footerContent = !gameFinished ? (
    <div className="flex justify-end">
      <LeaveGameButton gameId={gameId} />
    </div>
  ) : undefined;

  return (
    <PlayLayout
      tableContent={tableContent}
      title={gameFinished ? "Game Over" : "Online Game"}
      actionPopup={actionPopupContent}
      footer={footerContent}
    >
      {sidebarContent}
    </PlayLayout>
  );
}

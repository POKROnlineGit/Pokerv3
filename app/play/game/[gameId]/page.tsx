"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PokerTable } from "@/components/PokerTable";
import { ActionPopup } from "@/components/ActionPopup";
import { LeaveGameButton } from "@/components/LeaveGameButton";
import { GameState, ActionType } from "@/lib/types/poker";
import { getSocket, disconnectSocket } from "@/lib/socketClient";
import { createClientComponentClient } from "@/lib/supabaseClient";
import { AlertCircle, Wifi, WifiOff } from "lucide-react";
import { useToast } from "@/lib/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const [gameStatus, setGameStatus] = useState<string | null>(null);
  const [gameFinished, setGameFinished] = useState<{ reason: string } | null>(
    null
  ); // Game finished modal
  const [playerDisconnectTimers, setPlayerDisconnectTimers] = useState<
    Record<string, number>
  >({}); // Track disconnect countdowns per player
  const [forceHideActions, setForceHideActions] = useState(false); // Force hide action controls
  const [turnTimer, setTurnTimer] = useState<{
    deadline: number;
    duration: number;
    activeSeat: number;
  } | null>(null); // Turn timer data from turn_timer_started event
  // Animation state for community cards
  const [runoutCards, setRunoutCards] = useState<string[]>([]);
  const [isRunningOut, setIsRunningOut] = useState(false);
  const prevCommunityCardsRef = useRef<string[]>([]);
  const runoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevPhaseRef = useRef<string | null>(null); // Track previous phase for disconnect detection
  const disconnectTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const gameEndedRef = useRef<boolean>(false); // Track if GAME_FINISHED received
  const handRunoutRef = useRef<boolean>(false); // Track if HAND_RUNOUT received
  const joinRetryCountRef = useRef<number>(0); // Track retry attempts for "Game not found" errors
  const joinRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Track retry timeout
  const supabase = createClientComponentClient();
  const { toast } = useToast();

  // --- Client-Side Hydration: Player Names ---
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!gameState?.players && !currentUserId) return;

    const fetchNames = async () => {
      // Collect all player IDs (non-bots) from gameState
      const playerIds = new Set<string>();
      
      if (gameState?.players) {
        gameState.players
          .filter(p => !p.isBot)
          .forEach(p => playerIds.add(p.id));
      }
      
      // Explicitly include current user ID (same system as opponents)
      if (currentUserId) {
        playerIds.add(currentUserId);
      }

      // Find IDs we don't have names for yet
      const missingIds = Array.from(playerIds).filter(id => !playerNames[id]);

      if (missingIds.length === 0) return;

      // DIRECT DB CALL - Same system for all players including current user
      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', missingIds);

      if (data) {
        const newNames: Record<string, string> = {};
        data.forEach((p: any) => {
          if (p.username) newNames[p.id] = p.username;
        });
        setPlayerNames(prev => ({ ...prev, ...newNames }));
      }
    };

    fetchNames();
  }, [gameState?.players, currentUserId, supabase, playerNames]);

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

    const connectSocket = async () => {
      if (socket) return; // Already connected

      socket = getSocket();

      // Connect socket
      if (!socket.connected) {
        console.log("[Game] Connecting socket for game", {
          gameId,
          userId: currentUserId,
        });
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
          console.log("[Game] Socket connected, emitting joinGame", {
            gameId,
            userId: currentUserId,
          });
          socket.emit("joinGame", gameId);
          setIsSyncing(true);
        }
      };

      if (socket.connected) {
        console.log(
          "[Game] Socket already connected, running onConnect immediately",
          {
            gameId,
            userId: currentUserId,
          }
        );
        onConnect();
      } else {
        console.log(
          "[Game] Waiting for socket connect event before joining game",
          {
            gameId,
            userId: currentUserId,
          }
        );
        socket.once("connect", onConnect);
      }

      const handleGameEnded = (data: { message?: string; reason?: string }) => {
        if (!mounted) return;

        // IMMEDIATE ACTION CLEANUP: Force hide action controls
        setForceHideActions(true);
        gameEndedRef.current = true;

        // Set game finished state - this will show the modal
        // Do NOT redirect immediately - user stays on table view
        setGameFinished({
          reason: data.reason || data.message || "GAME_ENDED",
        });
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
            console.log("[Game] Game state received, resetting retry count", {
              gameId,
              previousRetries: joinRetryCountRef.current,
            });
            joinRetryCountRef.current = 0;
            if (joinRetryTimeoutRef.current) {
              clearTimeout(joinRetryTimeoutRef.current);
              joinRetryTimeoutRef.current = null;
            }
          }

          console.log("[Game] gameState received", {
            gameId,
            handNumber: (state as any).handNumber,
            currentRound: (state as any).currentRound,
            currentActorSeat: (state as any).currentActorSeat,
          });
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

          // Reset force hide flag if we get a new hand (handNumber changed)
          if (gameState && state.handNumber !== gameState.handNumber) {
            gameEndedRef.current = false;
            handRunoutRef.current = false;
            setForceHideActions(false);
          }

          // Reset force hide flag when new round state arrives (after DEAL_STREET)
          // This allows action controls to show again for the new betting round
          // Only reset if game hasn't ended and we're not in a runout
          if (!gameEndedRef.current && !handRunoutRef.current) {
            // Check if we're entering a new betting round (Flop, Turn, or River)
            const newRound = state.currentRound || (state as any).currentPhase;
            const isBettingRound = [
              "flop",
              "turn",
              "river",
              "preflop",
            ].includes(newRound);
            if (isBettingRound) {
              setForceHideActions(false);
            }
          }

          // CRITICAL: Fully replace local state on every gameState event
          // This ensures we always have the latest server state, even if phase reverts
          // (e.g., Flop → Waiting due to player leaving)

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

          // Detect actual phase from server (may be "waiting" or mapped to currentRound)
          const serverPhase =
            (state as any).currentPhase || state.currentRound || "preflop";
          const isWaitingPhase = serverPhase === "waiting";

          // BLOCK WAITING TRANSITION DURING ACTIVE HAND
          // Safety layer: If server sends WAITING_FOR_PLAYERS but we have cards/chips in pot,
          // ignore the waiting state and keep the current active state
          const hasActiveHand =
            (state.communityCards && state.communityCards.length > 0) ||
            mainPot > 0 ||
            (state.players &&
              state.players.some(
                (p: any) =>
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
              ? state.players.map((p: any) => ({
                  id: p.id || p.userId || p.user_id || "",
                  name: p.name || `Player ${p.seat || ""}`,
                  seat: p.seat || 0,
                  chips: typeof p.chips === "number" ? p.chips : 0,
                  currentBet: p.currentBet || 0,
                  totalBet: p.totalBet ?? p.totalBetThisHand ?? 0,
                  holeCards: Array.isArray(p.holeCards)
                    ? p.holeCards.filter(
                        (c: any): c is string => typeof c === "string"
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
            // Map phase to currentRound, handle phase reversals safely
            // If blocking waiting, preserve current round from previous state
            currentRound: shouldBlockWaiting
              ? gameState?.currentRound || state.currentRound || "preflop"
              : isWaitingPhase
              ? "preflop" // Map "waiting" to "preflop" for UI (adapter does this too)
              : state.currentRound ||
                (serverPhase === "waiting"
                  ? "preflop"
                  : (serverPhase as any)) ||
                "preflop",
            // Store actual phase for detection
            currentPhase: serverPhase,
            currentActorSeat:
              typeof state.currentActorSeat === "number"
                ? state.currentActorSeat
                : 0,
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
              typeof (state as any).bigBlind === "number"
                ? (state as any).bigBlind
                : (state as any).config?.blinds?.big ||
                  state.config?.bigBlind ||
                  2,
            smallBlind:
              typeof (state as any).smallBlind === "number"
                ? (state as any).smallBlind
                : (state as any).config?.blinds?.small ||
                  state.config?.smallBlind ||
                  1,
            // Calculate highBet from players if not directly available
            highBet:
              typeof (state as any).highBet === "number"
                ? (state as any).highBet
                : state.players?.length > 0
                ? Math.max(
                    ...state.players.map((p: any) => p.currentBet || 0),
                    0
                  )
                : 0,
            // Preserve left_players if server sends it (for visual feedback)
            ...((state as any).left_players && {
              left_players: (state as any).left_players,
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
          console.log("[Game] timeout event received", {
            gameId,
            seconds: data.seconds,
          });
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
          console.warn("[Game] Socket disconnected", { gameId });
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
          console.log("[Game] Socket reconnected, rejoining game", { gameId });
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

          if (data.status === "DISCONNECTED" || data.status === "LEFT") {
            setGameState((prevState) => {
              if (!prevState) return prevState;

              // Find and update the disconnected/left player
              const updatedPlayers = prevState.players.map((player) => {
                if (player.id === data.playerId) {
                  return {
                    ...player,
                    disconnected: data.status === "DISCONNECTED",
                    left: data.status === "LEFT",
                    isGhost: data.status === "DISCONNECTED",
                    // If action is FOLD, mark as folded immediately
                    folded: data.action === "FOLD" ? true : player.folded,
                    disconnectTimestamp:
                      data.status === "DISCONNECTED"
                        ? data.timestamp || Date.now()
                        : undefined,
                  };
                }
                return player;
              });

              // Check if active players dropped to 1
              const activePlayers = updatedPlayers.filter(
                (p) => !p.folded && p.chips > 0 && !(p as any).left
              );

              // IMMEDIATE ACTION CLEANUP: Force hide action controls if only 1 active player
              if (activePlayers.length <= 1) {
                setForceHideActions(true);
              }

              // Get player name for toast (before state update)
              const player = prevState.players.find(
                (p) => p.id === data.playerId
              );

              // Start disconnect countdown timer (60 seconds)
              if (data.timestamp) {
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

              // Show toast notification
              toast({
                title:
                  data.status === "LEFT"
                    ? "Player left"
                    : "Player disconnected",
                description:
                  data.status === "LEFT"
                    ? `${player?.name || "A player"} has left the game`
                    : `${player?.name || "A player"} disconnected${
                        data.action === "FOLD" ? " and folded" : ""
                      }`,
                variant: "default",
              });

              return {
                ...prevState,
                players: updatedPlayers,
              };
            });

            // Clear disconnect timer if player left
            if (data.status === "LEFT") {
              setPlayerDisconnectTimers((prev) => {
                const updated = { ...prev };
                delete updated[data.playerId];
                return updated;
              });
            }
          }
        }
      );

      // 2. HAND_RUNOUT: Animate remaining cards to board
      // REMOVED CLIENT-SIDE TIMEOUTS - Rely entirely on server events arriving in sequence
      socket.on(
        "HAND_RUNOUT",
        (data: {
          winnerId: string;
          board: string[];
          runoutCards: string[];
        }) => {
          if (!mounted) return;

          // IMMEDIATE ACTION CLEANUP: Clear action controls immediately
          // This event is a definitive signal that betting is over
          setForceHideActions(true);
          handRunoutRef.current = true; // Mark that runout has occurred

          // Set animation state for runout cards
          const runoutCardsList = data.runoutCards || [];
          if (runoutCardsList.length > 0) {
            setIsRunningOut(true);
            setRunoutCards(runoutCardsList);

            // Clear animation flags after animation completes
            if (runoutTimeoutRef.current) {
              clearTimeout(runoutTimeoutRef.current);
            }
            const animationDuration = runoutCardsList.length * 300 + 500;
            runoutTimeoutRef.current = setTimeout(() => {
              if (!mounted) return;
              setIsRunningOut(false);
              setRunoutCards([]);
              runoutTimeoutRef.current = null;
            }, animationDuration);
          }

          // Update board state immediately - server controls timing via DEAL_STREET events
          // PokerTable will detect new cards and animate them automatically
          // We just need to show the final board state
          const finalBoard = data.board || [];
          setGameState((prevState) => {
            if (!prevState) return prevState;

            const winner = prevState.players.find(
              (p) => p.id === data.winnerId
            );

            // Show winner notification
            toast({
              title: "Hand complete",
              description: `${winner?.name || "Player"} wins the pot!`,
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
          // This ensures that when new cards arrive (Flop/Turn/River), any stale
          // action controls from the previous round are wiped clean before the new
          // round's state arrives. Fixes "Action not handled" state sync issues.
          setForceHideActions(true);

          // Get new cards from the data
          const newCards = data.cards || [];

          // Set animation flags
          if (newCards.length > 0) {
            setIsRunningOut(true);
            setRunoutCards(newCards);
          }

          // Update board state immediately - server controls timing (2s intervals)
          setGameState((prevState) => {
            if (!prevState) return prevState;

            return {
              ...prevState,
              communityCards: data.communityCards || prevState.communityCards,
              currentRound:
                data.round === "flop"
                  ? "flop"
                  : data.round === "turn"
                  ? "turn"
                  : data.round === "river"
                  ? "river"
                  : prevState.currentRound,
            };
          });

          // Clear animation flags after animation completes (cards have animated)
          // Use a timeout to allow animation to play (staggered delays: 0.3s per card)
          // Clear any existing timeout first
          if (runoutTimeoutRef.current) {
            clearTimeout(runoutTimeoutRef.current);
          }
          const animationDuration = newCards.length * 300 + 500; // 300ms per card + 500ms buffer
          runoutTimeoutRef.current = setTimeout(() => {
            if (!mounted) return;
            setIsRunningOut(false);
            setRunoutCards([]);
            runoutTimeoutRef.current = null;
          }, animationDuration);
        }
      );

      // 5. GAME_FINISHED: Show modal when game ends (DO NOT redirect immediately)
      // Listen specifically for 'GAME_FINISHED' event (backend sends this exact string)
      socket.on(
        "GAME_FINISHED",
        (data: {
          gameId?: string;
          reason?: string;
          message?: string;
          payload?: any;
          winnerId?: string | null;
          returnUrl?: string;
          timestamp?: string;
        }) => {
          if (!mounted) return;

          console.log("[Game] GAME_FINISHED received", {
            gameId: data.gameId,
            reason: data.reason,
            winnerId: data.winnerId,
            timestamp: data.timestamp,
          });

          // IMMEDIATE ACTION CLEANUP: Force hide action controls
          setForceHideActions(true);
          gameEndedRef.current = true; // Mark that game has ended

          // Set game finished state - this will show the modal
          // Extract reason/message from payload (backend sends reason directly or in payload)
          const reason =
            data.reason ||
            data.message ||
            data.payload?.reason ||
            data.payload?.message ||
            "GAME_FINISHED";

          // Handle specific reasons with user-friendly messages
          let message: string;
          if (
            reason === "ALL_PLAYERS_LEFT" ||
            reason?.includes("ALL_PLAYERS_LEFT")
          ) {
            message = "Game Ended. All players have left.";
          } else if (
            reason?.includes("inactivity") ||
            reason?.includes("closed due to inactivity")
          ) {
            // Display inactivity reason directly from backend
            message = reason;
          } else {
            // Use reason directly, or fallback to generic message
            message =
              data.message ||
              data.reason ||
              data.payload?.reason ||
              data.payload?.message ||
              "The game has ended.";
          }

          // Safety: Don't try to display winner if winnerId is null (e.g., ALL_PLAYERS_LEFT, inactivity closures)
          // The message above already handles this case

          setGameFinished({ reason: message });
        }
      );

      // Also listen for GAME_ENDED (alternative event name) for backward compatibility
      socket.on(
        "GAME_ENDED",
        (data: { reason?: string; message?: string; payload?: any }) => {
          if (!mounted) return;

          // IMMEDIATE ACTION CLEANUP: Force hide action controls
          setForceHideActions(true);
          gameEndedRef.current = true;

          // Set game finished state
          const reason =
            data.reason ||
            data.message ||
            data.payload?.message ||
            "GAME_ENDED";
          const message =
            data.message ||
            data.reason ||
            data.payload?.message ||
            "The game has ended.";
          setGameFinished({ reason: message });
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
          console.log("[Game] SYNC_GAME received, resetting retry count", {
            gameId,
            previousRetries: joinRetryCountRef.current,
          });
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
            ? state.players.map((p: any) => ({
                id: p.id || p.userId || p.user_id || "",
                name: p.name || `Player ${p.seat || ""}`,
                seat: p.seat || 0,
                chips: typeof p.chips === "number" ? p.chips : 0,
                currentBet: p.currentBet || 0,
                totalBet: p.totalBet ?? p.totalBetThisHand ?? 0,
                holeCards: Array.isArray(p.holeCards)
                  ? p.holeCards.filter(
                      (c: any): c is string => typeof c === "string"
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
          currentRound: (state.currentRound ||
            (state as any).currentPhase ||
            "preflop") as "preflop" | "flop" | "turn" | "river" | "showdown",
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
            typeof (state as any).bigBlind === "number"
              ? (state as any).bigBlind
              : (state as any).config?.blinds?.big ||
                state.config?.bigBlind ||
                2,
          smallBlind:
            typeof (state as any).smallBlind === "number"
              ? (state as any).smallBlind
              : (state as any).config?.blinds?.small ||
                state.config?.smallBlind ||
                1,
          // Calculate highBet from players if not directly available
          highBet:
            typeof (state as any).highBet === "number"
              ? (state as any).highBet
              : state.players?.length > 0
              ? Math.max(...state.players.map((p: any) => p.currentBet || 0), 0)
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
            console.log(
              `[Game] Game not found, retrying joinGame (attempt ${joinRetryCountRef.current}/${maxRetries})`,
              { gameId }
            );

            // Clear any existing retry timeout
            if (joinRetryTimeoutRef.current) {
              clearTimeout(joinRetryTimeoutRef.current);
            }

            // Wait 500ms, then retry joinGame only (server will handle state sync)
            joinRetryTimeoutRef.current = setTimeout(() => {
              if (!mounted) return;

              console.log("[Game] Retrying joinGame after delay", {
                gameId,
                attempt: joinRetryCountRef.current,
              });
              socket.emit("joinGame", gameId);
            }, retryDelay);
          } else {
            // All retries exhausted, redirect to lobby
            console.error(
              "[Game] Game not found after all retries, redirecting to lobby",
              { gameId, retries: joinRetryCountRef.current }
            );
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
              router.replace("/play");
            }, 0);
          }
        } else if (errorMessage.includes("Not a player in this game")) {
          // No retry for authorization errors - redirect immediately
          console.error("[Game] User not authorized for game, redirecting", {
            gameId,
          });
          // Mark as unmounted to prevent state updates during redirect
          mounted = false;
          // Defer redirect to allow React to finish current render cycle
          setTimeout(() => {
            router.replace("/play");
          }, 0);
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
          console.warn(
            "[Game] No user found in setupGame, redirecting to root",
            {
              gameId,
            }
          );
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
            router.replace("/play");
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
      if (runoutTimeoutRef.current) {
        clearTimeout(runoutTimeoutRef.current);
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
        socket.emit("leaveGame", gameId);
      }

      // Clear all timeouts
      if (disconnectTimerIntervalRef.current) {
        clearInterval(disconnectTimerIntervalRef.current);
      }

      // Reset retry count on unmount
      joinRetryCountRef.current = 0;
    };
  }, [gameId, router, supabase, toast]);

  const handleAction = (action: ActionType, amount?: number) => {
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

    // Log warning if not player's turn, but still send action (server will validate)
    // This helps diagnose race conditions where gameState updates between render and action
    if (!isMyTurn) {
      console.warn(
        "[Game] ⚠️ Sending action when it may not be player's turn",
        {
          action,
          playerSeat: player.seat,
          currentActorSeat: gameState.currentActorSeat,
          playerFolded: player.folded,
          playerAllIn: player.allIn,
          gameState: {
            currentRound: gameState.currentRound,
            currentActorSeat: gameState.currentActorSeat,
            players: gameState.players.map((p) => ({
              seat: p.seat,
              name: p.name,
              folded: p.folded,
              allIn: p.allIn,
              currentBet: p.currentBet,
              chips: p.chips,
            })),
          },
        }
      );
      // Don't return - let server validate (but log for debugging)
    }

    const payload = {
      gameId,
      type: action,
      amount,
      seat: player.seat,
    };

    socket.emit("action", payload);
  };

  const handleRevealCard = (cardIndex: number) => {
    if (!gameState || !currentUserId) return;

    // Only allow revealing during showdown
    if (gameState.currentRound !== "showdown") {
      console.warn("[Game] ⚠️ Cannot reveal cards outside of showdown");
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

  return (
    <>
      {/* Game Finished Modal - RENDERED AT TOP LEVEL to persist when table state changes */}
      <Dialog
        open={!!gameFinished}
        onOpenChange={(open) => {
          // Prevent closing modal by clicking outside - user must click "Return to Lobby"
          if (!open && gameFinished) {
            return;
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md !z-[10000]"
          style={{ zIndex: 10000 }}
        >
          <DialogHeader>
            <DialogTitle>
              {gameFinished?.reason === "OPPONENT_LEFT" ||
              gameFinished?.reason?.includes("opponent") ||
              gameFinished?.reason?.includes("Opponent")
                ? "Game Over"
                : "Game Finished"}
            </DialogTitle>
            <DialogDescription className="text-lg">
              {gameFinished?.reason === "OPPONENT_LEFT" ||
              gameFinished?.reason?.includes("opponent") ||
              gameFinished?.reason?.includes("Opponent")
                ? "Game Complete! No opponents remaining."
                : gameFinished?.reason === "ALL_PLAYERS_LEFT" ||
                  gameFinished?.reason?.includes("ALL_PLAYERS_LEFT")
                ? "Game Ended. All players have left."
                : gameFinished?.reason === "NOT_ENOUGH_PLAYERS"
                ? "The game has ended because there are not enough players to continue."
                : gameFinished?.reason || "The game has ended."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                // Clean exit: disconnect socket and redirect
                // Do NOT emit leaveGame event (game is already over)
                const socket = getSocket();
                if (socket) {
                  // Remove all listeners to prevent any further events
                  socket.removeAllListeners();
                  // Disconnect the socket
                  disconnectSocket();
                }

                // Clear state
                setGameFinished(null);
                setForceHideActions(false);

                // Redirect to lobby
                router.push("/play");
              }}
              className="w-full"
            >
              Return to Lobby
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main game content - conditional rendering */}
      {isInitializing || !gameState || !currentUserId ? (
        <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[60vh]">
          <div>
            {isInitializing
              ? "Initializing Game Table..."
              : !currentUserId
              ? "Authenticating..."
              : "Connecting to game..."}
          </div>
        </div>
      ) : (
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
                Time remaining:{" "}
                <span className="font-bold">{timeoutSeconds}s</span> -
                Auto-folding soon
              </span>
            </div>
          )}

          {/* Multiplayer leave button - positioned absolutely at top */}
          <div className="absolute top-4 left-4 z-50">
            <LeaveGameButton gameId={gameId} />
          </div>

          {/* Table container - centered vertically and horizontally */}
          <div className="h-full w-full flex items-center justify-center">
            <PokerTable
              gameState={gameState}
              currentUserId={currentUserId}
              onRevealCard={handleRevealCard}
              playerNames={playerNames} // <--- Injected here
              isLocalGame={false}
              isHeadsUp={isHeadsUp}
              runoutCards={runoutCards}
              isRunningOut={isRunningOut}
              playerDisconnectTimers={playerDisconnectTimers}
              turnTimer={turnTimer}
              isSyncing={isSyncing}
            />
          </div>

          {/* Action Popup - Disabled if game finished or force hidden */}
          {!gameFinished && !forceHideActions && (
            <ActionPopup
              gameState={gameState}
              currentUserId={currentUserId}
              onAction={handleAction}
              onRevealCard={handleRevealCard}
              isLocalGame={false}
            />
          )}
        </div>
      )}
    </>
  );
}

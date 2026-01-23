"use client";

import { connectSocketWithAuth, useSocket } from "./client";
import { useCallback, useEffect, useState } from "react";
import {
  Club,
  ClubMember,
  ClubMessage,
  ClubMemberStats,
  ClubSocketCallbackResponse,
  CreateClubResponse,
  JoinClubResponse,
  GetClubStateResponse,
  GetPublicClubsResponse,
  GetMessagesResponse,
  GetMemberStatsResponse,
  ClubMessageEvent,
  ClubMemberJoinedEvent,
  ClubMemberLeftEvent,
  ClubMemberBannedEvent,
  ClubDisbandedEvent,
  ClubSettingsUpdatedEvent,
} from "@/lib/types/club";

/**
 * Hook for club socket operations
 * Provides all emit functions for club management
 */
export function useClubSocket() {
  const socket = useSocket();

  // ============================================
  // RESPONSE NORMALIZATION (supports old + new formats)
  // ============================================

  const getErrorMessageFromResponse = (response: unknown): string | undefined => {
    if (!response) return undefined;
    const res = response as Record<string, unknown>;
    // New standardized format: { success: false, error: { code, message } }
    if (res.success === false) {
      const err = res.error;
      if (typeof err === 'string') return err;
      if (err && typeof err === 'object') {
        const errObj = err as Record<string, unknown>;
        const msg = errObj.message ?? errObj.error;
        return typeof msg === 'string' ? msg : 'An error occurred';
      }
      const msg = res.message;
      return typeof msg === 'string' ? msg : 'An error occurred';
    }
    // Old format: { error: "..." }
    if (typeof res.error === 'string') return res.error;
    if (res.error && typeof res.error === 'object') {
      const errObj = res.error as Record<string, unknown>;
      const msg = errObj.message;
      if (typeof msg === 'string') return msg;
    }
    return undefined;
  };

  const getDataFromResponse = <T,>(response: unknown): T | undefined => {
    if (!response) return undefined;
    const res = response as Record<string, unknown>;
    // New standardized format: { success: true, data: ... }
    if (res.data !== undefined) return res.data as T;
    // Old format: payload was top-level
    return response as T;
  };

  // ============================================
  // CLUB MANAGEMENT
  // ============================================

  /**
   * Create a new club
   * User becomes leader and is automatically joined
   */
  const createClub = useCallback(
    (payload: {
      name: string;
      description?: string;
      isPublic?: boolean;
    }): Promise<{ clubId: string; inviteCode: string } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "create_club",
          payload,
          (response: CreateClubResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<{ clubId?: string; inviteCode?: string }>(response);
            const clubId = data?.clubId;
            const inviteCode = data?.inviteCode;
            if (clubId && inviteCode) {
              resolve({ clubId, inviteCode });
            } else {
              resolve({ error: "Invalid response" });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Join a public club by ID
   */
  const joinClub = useCallback(
    (clubId: string): Promise<{ club: Club } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "join_club",
          { clubId },
          (response: JoinClubResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<{ club?: Club }>(response);
            if (data?.club) {
              resolve({ club: data.club });
            } else {
              resolve({ error: "Invalid response" });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Join a club by invite code (works for private clubs)
   */
  const joinClubByCode = useCallback(
    (inviteCode: string): Promise<{ club: Club } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "join_club_by_code",
          { inviteCode },
          (response: JoinClubResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<{ club?: Club }>(response);
            if (data?.club) {
              resolve({ club: data.club });
            } else {
              resolve({ error: "Invalid response" });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Leave a club (members only, leaders must disband)
   */
  const leaveClub = useCallback(
    (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "leave_club",
          { clubId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Get complete club state
   */
  const getClubState = useCallback(
    (clubId: string): Promise<{
      club: Club;
      members: ClubMember[];
      isLeader: boolean;
      isMember: boolean;
    } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "get_club_state",
          { clubId },
          (response: GetClubStateResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<GetClubStateResponse>(response);
            if (data?.club && data?.members) {
              resolve({
                club: data.club,
                members: data.members,
                isLeader: data.isLeader ?? false,
                isMember: data.isMember ?? false,
              });
            } else {
              resolve({ error: "Invalid response" });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Get list of public clubs
   */
  const getPublicClubs = useCallback(
    (page?: number, limit?: number): Promise<{
      clubs: (Club & { member_count: number })[];
      total: number;
    } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "get_public_clubs",
          { page: page ?? 1, limit: limit ?? 20 },
          (response: GetPublicClubsResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<GetPublicClubsResponse>(response);
            resolve({
              clubs: data?.clubs ?? [],
              total: data?.total ?? 0,
            });
          }
        );
      });
    },
    [socket]
  );

  /**
   * Get the current user's club (if they're in one)
   */
  const getUserClub = useCallback(
    (): Promise<{ club: Club; role: string } | { club: null } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "get_user_club",
          {},
          (response: ClubSocketCallbackResponse & { club?: Club | null; role?: string }) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<{ club?: Club | null; role?: string }>(response);
            if (data?.club) {
              resolve({ club: data.club, role: data.role ?? 'member' });
            } else {
              resolve({ club: null });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // CHAT
  // ============================================

  /**
   * Send a message to the club chat
   */
  const sendMessage = useCallback(
    (clubId: string, content: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_send_message",
          { clubId, content },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Get paginated messages
   */
  const getMessages = useCallback(
    (
      clubId: string,
      before?: string,
      limit?: number
    ): Promise<{ messages: ClubMessage[]; hasMore: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_get_messages",
          { clubId, before, limit: limit ?? 50 },
          (response: GetMessagesResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<GetMessagesResponse>(response);
            resolve({
              messages: data?.messages ?? [],
              hasMore: data?.hasMore ?? false,
            });
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // LEADER ACTIONS
  // ============================================

  /**
   * Ban a member from the club
   */
  const banMember = useCallback(
    (
      clubId: string,
      userId: string,
      reason?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_ban_member",
          { clubId, userId, reason },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Unban a member from the club
   */
  const unbanMember = useCallback(
    (clubId: string, userId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_unban_member",
          { clubId, userId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Kick a member from the club (without banning)
   */
  const kickMember = useCallback(
    (clubId: string, userId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_kick_member",
          { clubId, userId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Update club settings (leader only)
   */
  const updateClubSettings = useCallback(
    (
      clubId: string,
      settings: { name?: string; description?: string; isPublic?: boolean }
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_update_settings",
          { clubId, ...settings },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Regenerate invite code (invalidates old code)
   */
  const regenerateInviteCode = useCallback(
    (clubId: string): Promise<{ inviteCode: string } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_regenerate_invite_code",
          { clubId },
          (response: ClubSocketCallbackResponse & { inviteCode?: string }) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<{ inviteCode?: string }>(response);
            if (data?.inviteCode) {
              resolve({ inviteCode: data.inviteCode });
            } else {
              resolve({ error: "Invalid response" });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Share a game to club chat
   */
  const shareGame = useCallback(
    (
      clubId: string,
      gameId: string,
      title?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_share_game",
          { clubId, gameId, title },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Share a tournament to club chat
   */
  const shareTournament = useCallback(
    (
      clubId: string,
      tournamentId: string,
      title?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_share_tournament",
          { clubId, tournamentId, title },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Disband the club (leader only)
   */
  const disbandClub = useCallback(
    (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "disband_club",
          { clubId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // ROOM MANAGEMENT
  // ============================================

  /**
   * Join club room for real-time updates
   */
  const joinClubRoom = useCallback(
    (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "join_club_room",
          { clubId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  /**
   * Leave club room when navigating away
   */
  const leaveClubRoom = useCallback(
    (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "leave_club_room",
          { clubId },
          (response: ClubSocketCallbackResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
            } else {
              resolve({ success: true });
            }
          }
        );
      });
    },
    [socket]
  );

  // ============================================
  // STATS
  // ============================================

  /**
   * Get member stats for the club
   */
  const getMemberStats = useCallback(
    (clubId: string): Promise<{ stats: ClubMemberStats[] } | { error: string }> => {
      return new Promise((resolve) => {
        void connectSocketWithAuth(socket);

        socket.emit(
          "club_get_member_stats",
          { clubId },
          (response: GetMemberStatsResponse) => {
            const errorMessage = getErrorMessageFromResponse(response);
            if (errorMessage) {
              resolve({ error: errorMessage });
              return;
            }

            const data = getDataFromResponse<GetMemberStatsResponse>(response);
            resolve({ stats: data?.stats ?? [] });
          }
        );
      });
    },
    [socket]
  );

  return {
    // Club management
    createClub,
    joinClub,
    joinClubByCode,
    leaveClub,
    getClubState,
    getPublicClubs,
    getUserClub,

    // Chat
    sendMessage,
    getMessages,

    // Leader actions
    banMember,
    unbanMember,
    kickMember,
    updateClubSettings,
    regenerateInviteCode,
    shareGame,
    shareTournament,
    disbandClub,

    // Room management
    joinClubRoom,
    leaveClubRoom,

    // Stats
    getMemberStats,
  };
}

/**
 * Hook to listen for club events
 * Automatically joins/leaves club room and listens for all club events
 */
export function useClubEvents(
  clubId?: string,
  options?: {
    onMessage?: (data: ClubMessageEvent) => void;
    onMemberJoined?: (data: ClubMemberJoinedEvent) => void;
    onMemberLeft?: (data: ClubMemberLeftEvent) => void;
    onMemberBanned?: (data: ClubMemberBannedEvent) => void;
    onClubDisbanded?: (data: ClubDisbandedEvent) => void;
    onSettingsUpdated?: (data: ClubSettingsUpdatedEvent) => void;
  }
) {
  const socket = useSocket();
  const {
    onMessage,
    onMemberJoined,
    onMemberLeft,
    onMemberBanned,
    onClubDisbanded,
    onSettingsUpdated,
  } = options || {};

  // State for real-time updates
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [disbanded, setDisbanded] = useState(false);

  useEffect(() => {
    if (!clubId) return;

    // Ensure socket is connected
    void connectSocketWithAuth(socket);

    // Join club room when connected
    const joinRoom = () => {
      socket.emit("join_club_room", { clubId }, (response: ClubSocketCallbackResponse) => {
        if (response?.error) {
          console.error("[Club] Failed to join room:", response.error);
        }
      });
    };

    // Join room immediately if already connected, otherwise wait for connection
    if (socket.connected) {
      joinRoom();
    } else {
      socket.once("connect", joinRoom);
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    const handleMessage = (data: ClubMessageEvent) => {
      if (data.clubId === clubId) {
        setMessages((prev) => [...prev, data.message]);
        onMessage?.(data);
      }
    };

    const handleMemberJoined = (data: ClubMemberJoinedEvent) => {
      if (data.clubId === clubId) {
        setMemberCount(data.memberCount);
        onMemberJoined?.(data);
      }
    };

    const handleMemberLeft = (data: ClubMemberLeftEvent) => {
      if (data.clubId === clubId) {
        setMemberCount(data.memberCount);
        onMemberLeft?.(data);
      }
    };

    const handleMemberBanned = (data: ClubMemberBannedEvent) => {
      if (data.clubId === clubId) {
        setMemberCount(data.memberCount);
        onMemberBanned?.(data);
      }
    };

    const handleClubDisbanded = (data: ClubDisbandedEvent) => {
      if (data.clubId === clubId) {
        setDisbanded(true);
        onClubDisbanded?.(data);
      }
    };

    const handleSettingsUpdated = (data: ClubSettingsUpdatedEvent) => {
      if (data.clubId === clubId) {
        onSettingsUpdated?.(data);
      }
    };

    const handleError = (error: { message?: string; clubId?: string }) => {
      if (!error.clubId || error.clubId === clubId) {
        console.error("[Club] Error:", error.message);
      }
    };

    // ============================================
    // REGISTER ALL EVENT LISTENERS
    // ============================================

    socket.on("CLUB_MESSAGE", handleMessage);
    socket.on("CLUB_MEMBER_JOINED", handleMemberJoined);
    socket.on("CLUB_MEMBER_LEFT", handleMemberLeft);
    socket.on("CLUB_MEMBER_BANNED", handleMemberBanned);
    socket.on("CLUB_DISBANDED", handleClubDisbanded);
    socket.on("CLUB_SETTINGS_UPDATED", handleSettingsUpdated);
    socket.on("error", handleError);

    // ============================================
    // CLEANUP
    // ============================================

    return () => {
      socket.off("CLUB_MESSAGE", handleMessage);
      socket.off("CLUB_MEMBER_JOINED", handleMemberJoined);
      socket.off("CLUB_MEMBER_LEFT", handleMemberLeft);
      socket.off("CLUB_MEMBER_BANNED", handleMemberBanned);
      socket.off("CLUB_DISBANDED", handleClubDisbanded);
      socket.off("CLUB_SETTINGS_UPDATED", handleSettingsUpdated);
      socket.off("error", handleError);
      socket.off("connect", joinRoom);

      // Leave club room when unmounting
      socket.emit("leave_club_room", { clubId }, (response: ClubSocketCallbackResponse) => {
        if (response?.error) {
          console.error("[Club] Failed to leave room:", response.error);
        }
      });
    };
  }, [
    socket,
    clubId,
    onMessage,
    onMemberJoined,
    onMemberLeft,
    onMemberBanned,
    onClubDisbanded,
    onSettingsUpdated,
  ]);

  return {
    messages,
    memberCount,
    disbanded,
    // Helper to clear messages (useful when loading initial messages)
    clearMessages: () => setMessages([]),
    // Helper to set messages (useful for initial load)
    setInitialMessages: (msgs: ClubMessage[]) => setMessages(msgs),
  };
}

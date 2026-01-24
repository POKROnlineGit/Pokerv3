"use client";

import { useCallback } from "react";
import {
  Club,
  ClubMember,
  ClubMessage,
  ClubMemberStats,
  ClubStateResponse,
  ClubListResponse,
  ClubMessagesResponse,
} from "@/lib/types/club";

/**
 * API response wrapper type
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
}

/**
 * Helper to make authenticated fetch requests
 */
async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error || "Request failed" };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Request failed" };
  }
}

/**
 * Hook for club HTTP API operations
 * Provides all functions for club management via HTTP endpoints
 */
export function useClubApi() {
  // ============================================
  // CLUB MANAGEMENT
  // ============================================

  /**
   * Create a new club
   * User becomes leader and is automatically joined
   */
  const createClub = useCallback(
    async (payload: {
      name: string;
      description?: string;
      isPublic?: boolean;
    }): Promise<{ clubId: string; inviteCode: string } | { error: string }> => {
      const result = await apiFetch<{ clubId: string; inviteCode: string }>(
        "/api/clubs",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return result.data!;
    },
    []
  );

  /**
   * Join a public club by ID
   */
  const joinClub = useCallback(
    async (clubId: string): Promise<{ club: Club } | { error: string }> => {
      const result = await apiFetch<{ club: Club }>(
        `/api/clubs/${clubId}/join`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return result.data!;
    },
    []
  );

  /**
   * Join a club by invite code (works for private clubs)
   */
  const joinClubByCode = useCallback(
    async (inviteCode: string): Promise<{ club: Club } | { error: string }> => {
      const result = await apiFetch<{ club: Club }>(
        `/api/clubs/join/${inviteCode}`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return result.data!;
    },
    []
  );

  /**
   * Leave a club (members only, leaders must disband)
   */
  const leaveClub = useCallback(
    async (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/leave`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  /**
   * Get complete club state (club details + members)
   */
  const getClubState = useCallback(
    async (
      clubId: string
    ): Promise<ClubStateResponse | { error: string }> => {
      const result = await apiFetch<ClubStateResponse>(`/api/clubs/${clubId}`);

      if (result.error) {
        return { error: result.error };
      }

      return result.data!;
    },
    []
  );

  /**
   * Get list of public clubs
   */
  const getPublicClubs = useCallback(
    async (
      page?: number,
      limit?: number
    ): Promise<
      { clubs: (Club & { member_count: number })[]; total: number } | { error: string }
    > => {
      const params = new URLSearchParams();
      if (page) params.append("page", String(page));
      if (limit) params.append("limit", String(limit));

      const result = await apiFetch<ClubListResponse>(
        `/api/clubs?${params.toString()}`
      );

      if (result.error) {
        return { error: result.error };
      }

      return {
        clubs: result.data!.clubs,
        total: result.data!.total,
      };
    },
    []
  );

  /**
   * Get the current user's club (if they're in one)
   */
  const getUserClub = useCallback(
    async (): Promise<
      { club: Club; role: string } | { club: null } | { error: string }
    > => {
      const result = await apiFetch<{ club: Club | null; role?: string }>(
        "/api/clubs/me"
      );

      if (result.error) {
        return { error: result.error };
      }

      if (result.data!.club) {
        return { club: result.data!.club, role: result.data!.role || "member" };
      }

      return { club: null };
    },
    []
  );

  // ============================================
  // CHAT
  // ============================================

  /**
   * Send a message to the club chat
   */
  const sendMessage = useCallback(
    async (
      clubId: string,
      content: string
    ): Promise<{ success: boolean; message?: ClubMessage } | { error: string }> => {
      const result = await apiFetch<{ success: boolean; message: ClubMessage }>(
        `/api/clubs/${clubId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ content }),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true, message: result.data?.message };
    },
    []
  );

  /**
   * Get paginated messages
   */
  const getMessages = useCallback(
    async (
      clubId: string,
      before?: string,
      limit?: number
    ): Promise<{ messages: ClubMessage[]; hasMore: boolean } | { error: string }> => {
      const params = new URLSearchParams();
      if (before) params.append("before", before);
      if (limit) params.append("limit", String(limit));

      const result = await apiFetch<ClubMessagesResponse>(
        `/api/clubs/${clubId}/messages?${params.toString()}`
      );

      if (result.error) {
        return { error: result.error };
      }

      return {
        messages: result.data!.messages,
        hasMore: result.data!.hasMore,
      };
    },
    []
  );

  // ============================================
  // LEADER ACTIONS
  // ============================================

  /**
   * Ban a member from the club
   */
  const banMember = useCallback(
    async (
      clubId: string,
      userId: string,
      reason?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/members/${userId}/ban`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  /**
   * Unban a member from the club
   */
  const unbanMember = useCallback(
    async (
      clubId: string,
      userId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/members/${userId}/unban`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  /**
   * Kick a member from the club (without banning)
   */
  const kickMember = useCallback(
    async (
      clubId: string,
      userId: string
    ): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/members/${userId}/kick`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  /**
   * Update club settings (leader only)
   */
  const updateClubSettings = useCallback(
    async (
      clubId: string,
      settings: { name?: string; description?: string; isPublic?: boolean }
    ): Promise<{ success: boolean; club?: Club } | { error: string }> => {
      const result = await apiFetch<{ success: boolean; club: Club }>(
        `/api/clubs/${clubId}/settings`,
        {
          method: "PATCH",
          body: JSON.stringify(settings),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true, club: result.data?.club };
    },
    []
  );

  /**
   * Regenerate invite code (invalidates old code)
   */
  const regenerateInviteCode = useCallback(
    async (clubId: string): Promise<{ inviteCode: string } | { error: string }> => {
      const result = await apiFetch<{ inviteCode: string }>(
        `/api/clubs/${clubId}/invite-code`,
        {
          method: "POST",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { inviteCode: result.data!.inviteCode };
    },
    []
  );

  /**
   * Disband the club (leader only)
   */
  const disbandClub = useCallback(
    async (clubId: string): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}`,
        {
          method: "DELETE",
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  // ============================================
  // STATS
  // ============================================

  /**
   * Get member stats for the club
   */
  const getMemberStats = useCallback(
    async (
      clubId: string
    ): Promise<{ stats: ClubMemberStats[] } | { error: string }> => {
      const result = await apiFetch<{ stats: ClubMemberStats[] }>(
        `/api/clubs/${clubId}/stats`
      );

      if (result.error) {
        return { error: result.error };
      }

      return { stats: result.data!.stats };
    },
    []
  );

  // ============================================
  // SHARING
  // ============================================

  /**
   * Share a game to club chat
   */
  const shareGame = useCallback(
    async (
      clubId: string,
      gameId: string,
      options?: {
        title?: string;
        blinds?: string;
        maxPlayers?: number;
        hostUsername?: string;
        variant?: string;
      }
    ): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: options?.title || "Private Game",
            messageType: "game_link",
            metadata: {
              gameId,
              title: options?.title,
              blinds: options?.blinds,
              maxPlayers: options?.maxPlayers,
              hostUsername: options?.hostUsername,
              variant: options?.variant,
              playerCount: 1,
            },
          }),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
  );

  /**
   * Share a tournament to club chat
   */
  const shareTournament = useCallback(
    async (
      clubId: string,
      tournamentId: string,
      title?: string
    ): Promise<{ success: boolean } | { error: string }> => {
      const result = await apiFetch<{ success: boolean }>(
        `/api/clubs/${clubId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: title || "Check out this tournament!",
            messageType: "tournament_link",
            metadata: { tournamentId, title },
          }),
        }
      );

      if (result.error) {
        return { error: result.error };
      }

      return { success: true };
    },
    []
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
    disbandClub,

    // Stats
    getMemberStats,

    // Sharing
    shareGame,
    shareTournament,
  };
}

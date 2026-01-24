// Club Role and Message Types
export type ClubRole = 'leader' | 'member';
export type ClubMessageType = 'text' | 'game_link' | 'tournament_link' | 'system';

// ============================================
// DATABASE TYPES (snake_case)
// ============================================

export interface Club {
  id: string;
  name: string;
  description: string | null;
  leader_id: string;
  is_public: boolean;
  invite_code: string;
  max_members: number;
  created_at: string;
  updated_at: string;
}

export interface ClubMember {
  id: string;
  club_id: string;
  user_id: string;
  role: ClubRole;
  joined_at: string;
  // Joined from profiles
  profiles?: {
    username: string;
  };
}

export interface ClubBan {
  id: string;
  club_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  banned_at: string;
}

export interface ClubMessage {
  id: string;
  club_id: string;
  user_id: string;
  content: string;
  message_type: ClubMessageType;
  metadata: ClubMessageMetadata;
  created_at: string;
  // Joined from profiles
  profiles?: {
    username: string;
  };
}

export interface ClubMessageMetadata {
  gameId?: string;
  tournamentId?: string;
  title?: string;
  blinds?: string;
  playerCount?: number;
}

// ============================================
// NORMALIZED TYPES (camelCase for frontend)
// ============================================

export interface NormalizedClub {
  id: string;
  name: string;
  description: string | null;
  leaderId: string;
  isPublic: boolean;
  inviteCode: string;
  maxMembers: number;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export interface NormalizedClubMember {
  id: string;
  clubId: string;
  userId: string;
  role: ClubRole;
  joinedAt: string;
  username: string;
}

export interface NormalizedClubMessage {
  id: string;
  clubId: string;
  userId: string;
  content: string;
  messageType: ClubMessageType;
  metadata: ClubMessageMetadata;
  createdAt: string;
  username: string;
}

export interface ClubMemberStats {
  userId: string;
  username: string;
  role: ClubRole;
  joinedAt: string;
  handsPlayed: number;
  vpipPercent: number;
  pfrPercent: number;
  lifetimeChipChange: number | null;
}

export interface LifetimeStats {
  hands_played: number;
  vpip: number;
  pfr: number;
  lifetime_chip_change: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ClubStateResponse {
  club: Club;
  members: ClubMember[];
  isLeader: boolean;
  isMember: boolean;
}

export interface ClubListResponse {
  clubs: (Club & { member_count: number })[];
  total: number;
  page: number;
  limit: number;
}

export interface ClubMessagesResponse {
  messages: ClubMessage[];
  hasMore: boolean;
}

// ============================================
// SOCKET EVENT TYPES
// ============================================

export interface ClubMessageEvent {
  clubId: string;
  message: ClubMessage;
}

export interface ClubMemberJoinedEvent {
  clubId: string;
  member: ClubMember;
  memberCount: number;
}

export interface ClubMemberLeftEvent {
  clubId: string;
  userId: string;
  memberCount: number;
}

export interface ClubMemberBannedEvent {
  clubId: string;
  userId: string;
  reason?: string;
  memberCount: number;
}

export interface ClubDisbandedEvent {
  clubId: string;
  reason?: string;
}

export interface ClubSettingsUpdatedEvent {
  clubId: string;
  club: Club;
}

// ============================================
// SOCKET CALLBACK TYPES
// ============================================

export interface ClubSocketCallbackResponse {
  success?: boolean;
  error?: string | { code?: string; message?: string };
  data?: unknown;
}

export interface CreateClubResponse extends ClubSocketCallbackResponse {
  clubId?: string;
  inviteCode?: string;
}

export interface JoinClubResponse extends ClubSocketCallbackResponse {
  club?: Club;
}

export interface GetClubStateResponse extends ClubSocketCallbackResponse {
  club?: Club;
  members?: ClubMember[];
  isLeader?: boolean;
  isMember?: boolean;
}

export interface GetPublicClubsResponse extends ClubSocketCallbackResponse {
  clubs?: (Club & { member_count: number })[];
  total?: number;
}

export interface GetMessagesResponse extends ClubSocketCallbackResponse {
  messages?: ClubMessage[];
  hasMore?: boolean;
}

export interface GetMemberStatsResponse extends ClubSocketCallbackResponse {
  stats?: ClubMemberStats[];
}

// ============================================
// NORMALIZER FUNCTIONS
// ============================================

/**
 * Normalize club data from backend (handles both snake_case and camelCase)
 */
export function normalizeClub(c: Club | Record<string, unknown>): NormalizedClub {
  const raw = c as Record<string, unknown>;
  return {
    id: (raw.id as string) || '',
    name: (raw.name as string) || '',
    description: (raw.description as string | null) ?? null,
    leaderId: (raw.leader_id as string) || (raw.leaderId as string) || '',
    isPublic: (raw.is_public as boolean) ?? (raw.isPublic as boolean) ?? true,
    inviteCode: (raw.invite_code as string) || (raw.inviteCode as string) || '',
    maxMembers: (raw.max_members as number) ?? (raw.maxMembers as number) ?? 25,
    createdAt: (raw.created_at as string) || (raw.createdAt as string) || '',
    updatedAt: (raw.updated_at as string) || (raw.updatedAt as string) || '',
    memberCount: (raw.member_count as number) ?? (raw.memberCount as number) ?? undefined,
  };
}

/**
 * Normalize club member data from backend
 */
export function normalizeClubMember(m: ClubMember | Record<string, unknown>): NormalizedClubMember {
  const raw = m as Record<string, unknown>;
  return {
    id: (raw.id as string) || '',
    clubId: (raw.club_id as string) || (raw.clubId as string) || '',
    userId: (raw.user_id as string) || (raw.userId as string) || '',
    role: ((raw.role as ClubRole) || 'member'),
    joinedAt: (raw.joined_at as string) || (raw.joinedAt as string) || '',
    username: (raw.username as string) || (raw.profiles as { username: string })?.username || 'Unknown',
  };
}

/**
 * Normalize club message data from backend
 */
export function normalizeClubMessage(m: ClubMessage | Record<string, unknown>): NormalizedClubMessage {
  const raw = m as Record<string, unknown>;
  return {
    id: (raw.id as string) || '',
    clubId: (raw.club_id as string) || (raw.clubId as string) || '',
    userId: (raw.user_id as string) || (raw.userId as string) || '',
    content: (raw.content as string) || '',
    messageType: ((raw.message_type as ClubMessageType) || (raw.messageType as ClubMessageType) || 'text'),
    metadata: (raw.metadata as ClubMessageMetadata) || {},
    createdAt: (raw.created_at as string) || (raw.createdAt as string) || '',
    username: (raw.username as string) || (raw.profiles as { username: string })?.username || 'Unknown',
  };
}

/**
 * Normalize club member stats from backend
 */
export function normalizeClubMemberStats(s: Record<string, unknown>): ClubMemberStats {
  return {
    userId: (s.user_id as string) || (s.userId as string) || '',
    username: (s.username as string) || 'Unknown',
    role: ((s.role as ClubRole) || 'member'),
    joinedAt: (s.joined_at as string) || (s.joinedAt as string) || '',
    handsPlayed: (s.hands_played as number) ?? (s.handsPlayed as number) ?? 0,
    vpipPercent: (s.vpip_percent as number) ?? (s.vpipPercent as number) ?? 0,
    pfrPercent: (s.pfr_percent as number) ?? (s.pfrPercent as number) ?? 0,
    lifetimeChipChange: (s.lifetime_chip_change as number | null) ?? (s.lifetimeChipChange as number | null) ?? null,
  };
}

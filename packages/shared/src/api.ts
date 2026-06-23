import { TournamentPhase, MatchStatus, MatchOutcome, PenaltyWinner } from './enums';

// ─── Request Interfaces ──────────────────────────────────────────────────────

/**
 * POST /predictions/match-winner
 */
export interface MatchWinnerPredictionRequest {
  matchId: string;
  outcome: MatchOutcome;
}

/**
 * POST /predictions/final-score
 */
export interface FinalScorePredictionRequest {
  matchId: string;
  team1Score: number;
  team2Score: number;
}

/**
 * POST /predictions/tournament-winner
 */
export interface TournamentWinnerPredictionRequest {
  teamId: string;
}

// ─── Response Interfaces ─────────────────────────────────────────────────────

/**
 * GET /matches response
 */
export interface MatchesResponse {
  matches: MatchView[];
  totalCount: number;
}

export interface MatchView {
  matchId: string;
  team1: TeamInfo;
  team2: TeamInfo;
  date: string;
  time: string;
  venue: string;
  phase: TournamentPhase;
  group?: string;
  status: MatchStatus;
  result?: MatchResult;
}

export interface TeamInfo {
  teamId: string;
  teamName: string;
}

export interface MatchResult {
  team1Score: number;
  team2Score: number;
  penaltyWinner?: PenaltyWinner;
}

/**
 * GET /leaderboard response
 */
export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  currentUserRank: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  totalScore: number;
  exactScoreCount: number;
  isCurrentUser: boolean;
}

/**
 * GET /predictions/me response
 */
export interface UserPredictionsResponse {
  predictions: PredictionRecord[];
  totalScore: number;
  leaderboardRank: number;
}

export interface PredictionRecord {
  matchId?: string;
  teamId?: string;
  predictionType: 'match_winner' | 'final_score' | 'tournament_winner';
  outcome?: MatchOutcome;
  team1Score?: number;
  team2Score?: number;
  teamName?: string;
  createdAt: string;
  updatedAt: string;
  // Resolved fields (populated when match is completed)
  pointsEarned?: number;
  isCorrect?: boolean;
  actualResult?: MatchResult;
}

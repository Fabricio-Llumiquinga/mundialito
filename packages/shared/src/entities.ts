import { TournamentPhase, MatchStatus, MatchOutcome, PredictionType, PenaltyWinner } from './enums';

/**
 * Match entity stored in DynamoDB.
 * PK: MATCH#{matchId}, SK: METADATA
 */
export interface MatchEntity {
  PK: string;
  SK: string;
  matchId: string;
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;
  date: string;
  time: string;
  venue: string;
  phase: TournamentPhase;
  group?: string;
  status: MatchStatus;
  team1Score?: number;
  team2Score?: number;
  penaltyWinner?: PenaltyWinner;
  lastUpdated: string;
}

/**
 * Phase index entity for listing matches by phase.
 * PK: PHASE#{phase} or PHASE#{phase}#GROUP#{group}, SK: MATCH#{date}#{matchId}
 */
export interface PhaseIndexEntity {
  PK: string;
  SK: string;
  matchId: string;
  team1Name: string;
  team2Name: string;
  date: string;
  time: string;
  venue: string;
  status: MatchStatus;
  team1Score?: number;
  team2Score?: number;
}

/**
 * Prediction entity stored in DynamoDB.
 * PK: USER#{userId}, SK: PRED#MATCH#{matchId} or PRED#TOURNAMENT_WINNER
 */
export interface PredictionEntity {
  PK: string;
  SK: string;
  userId: string;
  matchId?: string;
  predictionType: PredictionType;
  outcome?: MatchOutcome;
  team1Score?: number;
  team2Score?: number;
  teamId?: string;
  teamName?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Denormalized match predictions entity for efficient scoring queries.
 * PK: MATCH_PREDS#{matchId}, SK: USER#{userId}
 */
export interface MatchPredictionsEntity {
  PK: string;
  SK: string;
  userId: string;
  matchId: string;
  winnerOutcome?: MatchOutcome;
  team1Score?: number;
  team2Score?: number;
  updatedAt: string;
}

/**
 * User score entity with GSI1 for leaderboard queries.
 * PK: USER#{userId}, SK: SCORE
 * GSI1PK: LEADERBOARD, GSI1SK: SCORE#{invertedScore}#{invertedExactCount}#{displayName}
 */
export interface UserScoreEntity {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  userId: string;
  displayName: string;
  totalScore: number;
  exactScoreCount: number;
  matchWinnerCorrect: number;
  tournamentWinnerCorrect: boolean;
  lastUpdated: string;
}

/**
 * Team entity for the 48 participating teams.
 * PK: TEAM#{teamId}, SK: METADATA
 */
export interface TeamEntity {
  PK: string;
  SK: string;
  teamId: string;
  teamName: string;
  group: string;
  fifaCode: string;
}

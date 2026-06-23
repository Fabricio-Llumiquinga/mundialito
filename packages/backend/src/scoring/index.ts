/**
 * Scoring module for calculating prediction points.
 */

export {
  ScoringService,
  determineMatchWinner,
  calculateMatchPoints,
  MATCH_WINNER_POINTS,
  EXACT_SCORE_BONUS_POINTS,
  EXACT_SCORE_TOTAL_POINTS,
  TOURNAMENT_WINNER_POINTS,
} from './scoring-service';

export type { MatchResultForScoring, ScoringResult } from './scoring-service';

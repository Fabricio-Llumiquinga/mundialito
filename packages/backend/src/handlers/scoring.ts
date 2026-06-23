/**
 * Scoring Lambda handler triggered by match result updates.
 *
 * Processes match result confirmations by:
 * 1. Validating the incoming match result event
 * 2. Invoking ScoringService.scoreMatch() which queries all predictions
 *    for the match from MATCH_PREDS# partition and calculates/persists scores
 * 3. Returns scoring summary
 *
 * Designed to complete scoring within 1 hour of result recording.
 * Failed scoring attempts are routed to a dead letter queue for retry.
 *
 * Requirements: 6.5
 */

import { PenaltyWinner } from '@mudialito/shared';
import { ScoringService, MatchResultForScoring, ScoringResult } from '../scoring/scoring-service';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Event payload for the scoring Lambda.
 * Triggered when a match result is confirmed (e.g., via ingestion or admin action).
 */
export interface ScoringEvent {
  matchId: string;
  team1Score: number;
  team2Score: number;
  penaltyWinner?: PenaltyWinner;
}

/**
 * Response returned by the scoring Lambda handler.
 */
export interface ScoringHandlerResponse {
  statusCode: number;
  body: {
    success: boolean;
    matchId: string;
    usersScored: number;
    totalPointsAwarded: number;
    errors: ScoringError[];
    timestamp: string;
  };
}

/**
 * Error details for individual scoring failures.
 */
export interface ScoringError {
  userId: string;
  error: string;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

/**
 * Lambda handler for scoring match results.
 *
 * The ScoringService handles:
 * - Querying all predictions for the match from MATCH_PREDS# partition
 * - Calculating points for each user's predictions
 * - Atomically updating user score entities with new totals
 *
 * If the handler fails (e.g., cannot connect to DynamoDB), the event
 * is routed to a dead letter queue for retry/manual review.
 */
export async function handler(event: ScoringEvent): Promise<ScoringHandlerResponse> {
  const timestamp = new Date().toISOString();
  const { matchId, team1Score, team2Score, penaltyWinner } = event;

  console.log('[ScoringHandler] Processing match result', {
    matchId,
    team1Score,
    team2Score,
    penaltyWinner,
    timestamp,
  });

  // Validate event payload
  if (!matchId || team1Score === undefined || team2Score === undefined) {
    console.error('[ScoringHandler] Invalid event payload', { event });
    throw new Error('Invalid scoring event: matchId, team1Score, and team2Score are required');
  }

  if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
    console.error('[ScoringHandler] Score values must be numbers', { team1Score, team2Score });
    throw new Error('Invalid scoring event: team1Score and team2Score must be numbers');
  }

  const scoringService = new ScoringService();

  const matchResult: MatchResultForScoring = {
    matchId,
    team1Score,
    team2Score,
    penaltyWinner,
  };

  try {
    const scoringResult = await scoringService.scoreMatch(matchId, matchResult);

    const totalPointsAwarded = scoringResult.pointsAwarded.reduce(
      (sum, award) => sum + award.points,
      0,
    );

    console.log('[ScoringHandler] Scoring completed successfully', {
      matchId,
      usersScored: scoringResult.usersScored,
      totalPointsAwarded,
      timestamp,
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        matchId,
        usersScored: scoringResult.usersScored,
        totalPointsAwarded,
        errors: [],
        timestamp,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[ScoringHandler] Scoring failed', {
      matchId,
      error: errorMessage,
      timestamp,
    });

    // Re-throw to trigger dead letter queue routing
    throw error;
  }
}

// ─── Handler Factory (for testing) ──────────────────────────────────────────

/**
 * Create a scoring handler with injectable dependencies (for testing).
 */
export function createScoringHandler(scoringService: ScoringService) {
  return async (event: ScoringEvent): Promise<ScoringHandlerResponse> => {
    const timestamp = new Date().toISOString();
    const { matchId, team1Score, team2Score, penaltyWinner } = event;

    console.log('[ScoringHandler] Processing match result', {
      matchId,
      team1Score,
      team2Score,
      penaltyWinner,
      timestamp,
    });

    if (!matchId || team1Score === undefined || team2Score === undefined) {
      console.error('[ScoringHandler] Invalid event payload', { event });
      throw new Error('Invalid scoring event: matchId, team1Score, and team2Score are required');
    }

    if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
      console.error('[ScoringHandler] Score values must be numbers', { team1Score, team2Score });
      throw new Error('Invalid scoring event: team1Score and team2Score must be numbers');
    }

    const matchResult: MatchResultForScoring = {
      matchId,
      team1Score,
      team2Score,
      penaltyWinner,
    };

    try {
      const scoringResult = await scoringService.scoreMatch(matchId, matchResult);

      const totalPointsAwarded = scoringResult.pointsAwarded.reduce(
        (sum, award) => sum + award.points,
        0,
      );

      console.log('[ScoringHandler] Scoring completed successfully', {
        matchId,
        usersScored: scoringResult.usersScored,
        totalPointsAwarded,
        timestamp,
      });

      return {
        statusCode: 200,
        body: {
          success: true,
          matchId,
          usersScored: scoringResult.usersScored,
          totalPointsAwarded,
          errors: [],
          timestamp,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[ScoringHandler] Scoring failed', {
        matchId,
        error: errorMessage,
        timestamp,
      });

      // Re-throw to trigger dead letter queue routing
      throw error;
    }
  };
}

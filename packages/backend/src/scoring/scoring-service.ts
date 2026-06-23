/**
 * Scoring service for calculating prediction points.
 *
 * Responsibilities:
 * - Calculate points when match results are confirmed
 * - Award 3 points for correct match winner prediction
 * - Award 5 additional points (total 8) for correct exact score prediction
 * - Award 10 points for correct tournament winner prediction
 * - Handle knockout penalty shootout logic
 * - Use atomic DynamoDB updates for score increments
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { MatchPredictionsEntity, UserScoreEntity, PredictionEntity, MatchOutcome, PenaltyWinner } from '@mudialito/shared';
import {
  matchPredictionsKey,
  userKey,
  scoreKey,
  leaderboardGSIPK,
  leaderboardGSIKey,
  tournamentWinnerPredictionKey,
  getDefaultClient,
  getTableName,
} from '../db';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Points awarded for correctly predicting the match winner */
export const MATCH_WINNER_POINTS = 3;

/** Additional points awarded for correctly predicting the exact final score */
export const EXACT_SCORE_BONUS_POINTS = 5;

/** Total points for correct winner + exact score (3 + 5 = 8) */
export const EXACT_SCORE_TOTAL_POINTS = MATCH_WINNER_POINTS + EXACT_SCORE_BONUS_POINTS;

/** Points awarded for correctly predicting the tournament winner */
export const TOURNAMENT_WINNER_POINTS = 10;

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Match result data used for scoring.
 */
export interface MatchResultForScoring {
  matchId: string;
  team1Score: number;
  team2Score: number;
  penaltyWinner?: PenaltyWinner;
}

/**
 * Result of a scoring operation.
 */
export interface ScoringResult {
  matchId: string;
  usersScored: number;
  pointsAwarded: { userId: string; points: number }[];
}

// ─── Scoring Service ─────────────────────────────────────────────────────────

/**
 * Service responsible for calculating and persisting prediction scores.
 */
export class ScoringService {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client?: DynamoDBDocumentClient, tableName?: string) {
    this.client = client ?? getDefaultClient();
    this.tableName = tableName ?? getTableName();
  }

  /**
   * Score all user predictions for a completed match.
   *
   * Queries all predictions for the match from the MATCH_PREDS# partition,
   * calculates points for each user, and atomically updates their scores.
   *
   * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6, 6.7
   */
  async scoreMatch(matchId: string, result: MatchResultForScoring): Promise<ScoringResult> {
    // Query all predictions for this match
    const predictions = await this.getMatchPredictions(matchId);

    const pointsAwarded: { userId: string; points: number }[] = [];

    // Determine the actual match winner
    const actualWinner = determineMatchWinner(result);

    for (const prediction of predictions) {
      const points = calculateMatchPoints(prediction, result, actualWinner);

      if (points > 0) {
        const isExactScore = points === EXACT_SCORE_TOTAL_POINTS;
        await this.updateUserScore(prediction.userId, points, isExactScore);
      }

      pointsAwarded.push({ userId: prediction.userId, points });
    }

    return {
      matchId,
      usersScored: predictions.length,
      pointsAwarded,
    };
  }

  /**
   * Score all user predictions for the tournament winner.
   *
   * Queries all users with tournament winner predictions and awards points
   * to those who correctly predicted the winning team.
   *
   * Requirements: 6.3
   */
  async scoreTournamentWinner(winningTeamId: string): Promise<ScoringResult> {
    // Query all users who have a tournament winner prediction
    // We need to scan for PRED#TOURNAMENT_WINNER entries
    const predictions = await this.getTournamentWinnerPredictions();

    const pointsAwarded: { userId: string; points: number }[] = [];

    for (const prediction of predictions) {
      const points = prediction.teamId === winningTeamId ? TOURNAMENT_WINNER_POINTS : 0;

      if (points > 0) {
        await this.updateUserScore(prediction.userId, points, false, true);
      }

      pointsAwarded.push({ userId: prediction.userId, points });
    }

    return {
      matchId: 'TOURNAMENT_WINNER',
      usersScored: predictions.length,
      pointsAwarded,
    };
  }

  // ─── Private Methods ─────────────────────────────────────────────────────

  /**
   * Query all predictions for a specific match from the MATCH_PREDS# partition.
   */
  private async getMatchPredictions(matchId: string): Promise<MatchPredictionsEntity[]> {
    const items: MatchPredictionsEntity[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': matchPredictionsKey(matchId),
          },
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );

      if (result.Items) {
        items.push(...(result.Items as MatchPredictionsEntity[]));
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return items;
  }

  /**
   * Get all tournament winner predictions by scanning for PRED#TOURNAMENT_WINNER entries.
   *
   * Note: In a production system with many users, this could be optimized with a GSI.
   * For ~100 users, a scan with filter is acceptable.
   */
  private async getTournamentWinnerPredictions(): Promise<Array<{ userId: string; teamId: string }>> {
    const items: Array<{ userId: string; teamId: string }> = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: undefined,
          KeyConditionExpression: undefined as unknown as string,
          FilterExpression: 'SK = :sk AND predictionType = :type',
          ExpressionAttributeValues: {
            ':sk': tournamentWinnerPredictionKey(),
            ':type': 'tournament_winner',
          },
          ExclusiveStartKey: lastEvaluatedKey,
        } as any),
      );

      if (result.Items) {
        for (const item of result.Items) {
          const pred = item as PredictionEntity;
          if (pred.userId && pred.teamId) {
            items.push({ userId: pred.userId, teamId: pred.teamId });
          }
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    return items;
  }

  /**
   * Atomically update a user's score in DynamoDB.
   *
   * Uses UpdateCommand with ADD expression for atomic increments.
   * Also updates the GSI1SK (leaderboard key) after the score change.
   *
   * Requirements: 6.4, 6.5
   */
  private async updateUserScore(
    userId: string,
    points: number,
    isExactScore: boolean,
    isTournamentWinner: boolean = false,
  ): Promise<void> {
    const now = new Date().toISOString();
    const exactScoreIncrement = isExactScore ? 1 : 0;

    // First, atomically increment the score
    const updateResult = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: userKey(userId),
          SK: scoreKey(),
        },
        UpdateExpression: isTournamentWinner
          ? 'SET lastUpdated = :now, tournamentWinnerCorrect = :twc, GSI1PK = :gsi1pk ADD totalScore :points, matchWinnerCorrect :mwc, exactScoreCount :esc'
          : 'SET lastUpdated = :now, GSI1PK = :gsi1pk ADD totalScore :points, matchWinnerCorrect :mwc, exactScoreCount :esc',
        ExpressionAttributeValues: {
          ':points': points,
          ':mwc': isTournamentWinner ? 0 : 1,
          ':esc': exactScoreIncrement,
          ':now': now,
          ':gsi1pk': leaderboardGSIPK(),
          ...(isTournamentWinner ? { ':twc': true } : {}),
        },
        ReturnValues: 'ALL_NEW',
      }),
    );

    // Update the GSI1SK with the new score values for leaderboard ordering
    const updatedItem = updateResult.Attributes as UserScoreEntity | undefined;
    if (updatedItem) {
      const newTotalScore = Math.max(0, updatedItem.totalScore ?? 0);
      const newExactCount = updatedItem.exactScoreCount ?? 0;
      const displayName = updatedItem.displayName ?? userId;

      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: userKey(userId),
            SK: scoreKey(),
          },
          UpdateExpression: 'SET GSI1SK = :gsi1sk, totalScore = :ts',
          ExpressionAttributeValues: {
            ':gsi1sk': leaderboardGSIKey(newTotalScore, newExactCount, displayName),
            ':ts': newTotalScore,
          },
        }),
      );
    }
  }
}

// ─── Pure Scoring Functions ──────────────────────────────────────────────────

/**
 * Determine the match winner from the result.
 *
 * For knockout matches with penalty shootout (scores are tied but penaltyWinner is set),
 * the winner is the penalty winner.
 *
 * For regular matches:
 * - team1Score > team2Score → 'team1'
 * - team2Score > team1Score → 'team2'
 * - team1Score === team2Score → 'draw' (group stage) or use penaltyWinner (knockout)
 *
 * Requirements: 6.1, 6.7
 */
export function determineMatchWinner(result: MatchResultForScoring): MatchOutcome {
  if (result.team1Score > result.team2Score) {
    return 'team1';
  }
  if (result.team2Score > result.team1Score) {
    return 'team2';
  }
  // Scores are tied
  if (result.penaltyWinner) {
    // Knockout match decided by penalties — the penalty winner is the match winner
    return result.penaltyWinner;
  }
  // Group stage draw
  return 'draw';
}

/**
 * Calculate points for a single user's prediction against a match result.
 *
 * Scoring rules:
 * - 3 points for correct match winner prediction
 * - 5 additional points (total 8) for correct exact score
 * - 0 points for incorrect or missing predictions
 *
 * Requirements: 6.1, 6.2, 6.4, 6.6, 6.7
 */
export function calculateMatchPoints(
  prediction: MatchPredictionsEntity,
  result: MatchResultForScoring,
  actualWinner: MatchOutcome,
): number {
  let points = 0;

  // Check match winner prediction
  const predictedWinner = prediction.winnerOutcome;
  if (predictedWinner && predictedWinner === actualWinner) {
    points += MATCH_WINNER_POINTS;
  }

  // Check exact score prediction (only awards bonus if winner was also correct)
  if (
    prediction.team1Score !== undefined &&
    prediction.team2Score !== undefined &&
    prediction.team1Score === result.team1Score &&
    prediction.team2Score === result.team2Score
  ) {
    // Exact score correct — award the bonus points
    // Note: if the exact score is correct, the winner prediction must also be correct
    // (since the score determines the winner), so we ensure winner points are included
    if (points === 0) {
      // Edge case: user predicted exact score but not the winner separately
      // The exact score implies the correct winner, so award winner points too
      points = MATCH_WINNER_POINTS;
    }
    points += EXACT_SCORE_BONUS_POINTS;
  }

  return points;
}

/**
 * Prediction validation service.
 *
 * Validates prediction submissions for:
 * - Match winner predictions (outcome by phase, match open status)
 * - Final score predictions (non-negative integers in [0, 99])
 * - Tournament winner predictions (valid team ID from 48 participants)
 * - Deadline enforcement (match must be upcoming)
 *
 * Requirements: 3.1, 3.2, 3.6, 3.7, 4.3, 4.5, 5.1, 5.4
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { MatchEntity, TournamentPhase, MatchOutcome, MatchStatus } from '@mudialito/shared';
import { matchKey, matchMetadataSK, phaseKey, phaseMatchSK, getDefaultClient, getTableName } from '../db';

/**
 * Result of a validation check.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** The number of participating teams in the 2026 World Cup */
const PARTICIPATING_TEAMS_COUNT = 48;

/** Phases that are part of the knockout stage (no draws allowed) */
const KNOCKOUT_PHASES: TournamentPhase[] = [
  'round_of_32',
  'round_of_16',
  'quarter_finals',
  'semi_finals',
  'third_place',
  'final',
];

/** Minimum valid score value */
const MIN_SCORE = 0;

/** Maximum valid score value */
const MAX_SCORE = 99;

/**
 * PredictionValidator validates prediction submissions against business rules.
 */
export class PredictionValidator {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client?: DynamoDBDocumentClient, tableName?: string) {
    this.client = client ?? getDefaultClient();
    this.tableName = tableName ?? getTableName();
  }

  /**
   * Validate a match winner prediction.
   *
   * Rules:
   * - Group stage: allows 'team1', 'team2', or 'draw'
   * - Knockout stages: allows only 'team1' or 'team2' (no draw)
   *
   * Requirements: 3.1, 3.2
   */
  validateMatchWinner(outcome: MatchOutcome, phase: TournamentPhase): ValidationResult {
    const validOutcomes: MatchOutcome[] = ['team1', 'team2', 'draw'];

    if (!validOutcomes.includes(outcome)) {
      return { valid: false, error: `Invalid outcome: ${outcome}` };
    }

    if (outcome === 'draw' && KNOCKOUT_PHASES.includes(phase)) {
      return { valid: false, error: 'Draw is not a valid outcome for knockout matches' };
    }

    return { valid: true };
  }

  /**
   * Validate a final score prediction.
   *
   * Rules:
   * - Both scores must be non-negative integers
   * - Both scores must be in range [0, 99]
   *
   * Requirements: 4.3
   */
  validateFinalScore(team1Score: number, team2Score: number): ValidationResult {
    const team1Error = this.validateScoreValue(team1Score, 'team1Score');
    if (team1Error) {
      return { valid: false, error: team1Error };
    }

    const team2Error = this.validateScoreValue(team2Score, 'team2Score');
    if (team2Error) {
      return { valid: false, error: team2Error };
    }

    return { valid: true };
  }

  /**
   * Validate a tournament winner prediction.
   *
   * Rules:
   * - The team ID must belong to one of the 48 participating teams
   *
   * Requirements: 5.1
   */
  async validateTournamentWinner(teamId: string): Promise<ValidationResult> {
    if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
      return { valid: false, error: 'Team ID is required' };
    }

    const isParticipating = await this.isParticipatingTeam(teamId);
    if (!isParticipating) {
      return { valid: false, error: 'Selected team is not a participating team' };
    }

    return { valid: true };
  }

  /**
   * Check if a match is open for predictions.
   * Returns true only if the match status is 'upcoming'.
   *
   * Requirements: 3.6, 4.5
   */
  async isMatchOpen(matchId: string): Promise<boolean> {
    const match = await this.getMatch(matchId);
    if (!match) {
      return false;
    }
    return match.status === 'upcoming';
  }

  /**
   * Check if the tournament winner prediction is still open.
   * Returns true only if the Final match status is 'upcoming'.
   *
   * Requirements: 5.4
   */
  async isTournamentWinnerOpen(): Promise<boolean> {
    const finalMatch = await this.getFinalMatch();
    if (!finalMatch) {
      // If no final match exists yet, predictions are open
      return true;
    }
    return finalMatch.status === 'upcoming';
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Validate a single score value.
   * Returns an error message if invalid, null if valid.
   */
  private validateScoreValue(score: number, fieldName: string): string | null {
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return `${fieldName} must be a number`;
    }

    if (!Number.isInteger(score)) {
      return 'Goal values must be integers between 0 and 99';
    }

    if (score < MIN_SCORE || score > MAX_SCORE) {
      return 'Goal values must be integers between 0 and 99';
    }

    return null;
  }

  /**
   * Fetch a match entity from DynamoDB by match ID.
   */
  private async getMatch(matchId: string): Promise<MatchEntity | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: matchKey(matchId),
          SK: matchMetadataSK(),
        },
      })
    );

    return (result.Item as MatchEntity) ?? null;
  }

  /**
   * Find the Final match by querying the PHASE#final partition.
   * Returns the first (and only) final match, or null if not found.
   */
  private async getFinalMatch(): Promise<MatchEntity | null> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': phaseKey('final'),
        },
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    // The phase index gives us the matchId; fetch the full match entity
    const phaseItem = result.Items[0] as { matchId: string };
    return this.getMatch(phaseItem.matchId);
  }

  /**
   * Check if a team ID belongs to one of the 48 participating teams.
   * Queries the TEAM#{teamId} entity in DynamoDB.
   */
  private async isParticipatingTeam(teamId: string): Promise<boolean> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `TEAM#${teamId}`,
          SK: 'METADATA',
        },
      })
    );

    return result.Item !== undefined;
  }
}

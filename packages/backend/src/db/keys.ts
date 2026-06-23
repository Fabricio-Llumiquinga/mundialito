/**
 * DynamoDB key generation helpers for the MundialPredictions single-table design.
 *
 * These helpers produce consistent, deterministic keys for all entity types
 * stored in the table.
 */

// --- Key Prefixes ---
const MATCH_PREFIX = 'MATCH#';
const USER_PREFIX = 'USER#';
const PRED_PREFIX = 'PRED#';
const PHASE_PREFIX = 'PHASE#';
const GROUP_SUFFIX = '#GROUP#';
const MATCH_PREDS_PREFIX = 'MATCH_PREDS#';
const SCORE_SK = 'SCORE';
const METADATA_SK = 'METADATA';
const TOURNAMENT_WINNER_SK = 'PRED#TOURNAMENT_WINNER';
const LEADERBOARD_PK = 'LEADERBOARD';
const SCORE_GSI_PREFIX = 'SCORE#';

/** Maximum score value used for inverted score calculation (5 digits) */
const MAX_SCORE = 99999;

/** Maximum exact count value used for inverted exact count calculation (5 digits) */
const MAX_EXACT_COUNT = 99999;

/** Padding width for inverted score values */
const SCORE_PAD_WIDTH = 5;

// --- Match Keys ---

/**
 * Generate the PK for a match entity.
 * @example matchKey('m-2026-06-11-mex-usa') => 'MATCH#m-2026-06-11-mex-usa'
 */
export function matchKey(matchId: string): string {
  return `${MATCH_PREFIX}${matchId}`;
}

/**
 * Generate the SK for a match metadata entity.
 * @returns 'METADATA'
 */
export function matchMetadataSK(): string {
  return METADATA_SK;
}

// --- User Keys ---

/**
 * Generate the PK for a user entity.
 * @example userKey('user-123') => 'USER#user-123'
 */
export function userKey(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

// --- Prediction Keys ---

/**
 * Generate the SK for a match prediction.
 * @example predictionKey('m-2026-06-11-mex-usa') => 'PRED#MATCH#m-2026-06-11-mex-usa'
 */
export function predictionKey(matchId: string): string {
  return `${PRED_PREFIX}${MATCH_PREFIX}${matchId}`;
}

/**
 * Generate the SK for a tournament winner prediction.
 * @returns 'PRED#TOURNAMENT_WINNER'
 */
export function tournamentWinnerPredictionKey(): string {
  return TOURNAMENT_WINNER_SK;
}

/**
 * Prefix for querying all predictions for a user (begins_with).
 * @returns 'PRED#'
 */
export function predictionPrefix(): string {
  return PRED_PREFIX;
}

// --- Phase Index Keys ---

/**
 * Generate the PK for a phase index entity.
 * @example phaseKey('group_stage') => 'PHASE#group_stage'
 * @example phaseKey('group_stage', 'A') => 'PHASE#group_stage#GROUP#A'
 */
export function phaseKey(phase: string, group?: string): string {
  if (group) {
    return `${PHASE_PREFIX}${phase}${GROUP_SUFFIX}${group}`;
  }
  return `${PHASE_PREFIX}${phase}`;
}

/**
 * Generate the SK for a phase index entry (for chronological sorting).
 * @example phaseMatchSK('2026-06-11', 'm-2026-06-11-mex-usa') => 'MATCH#2026-06-11#m-2026-06-11-mex-usa'
 */
export function phaseMatchSK(date: string, matchId: string): string {
  return `${MATCH_PREFIX}${date}#${matchId}`;
}

// --- Score Keys ---

/**
 * Generate the SK for a user score entity.
 * @returns 'SCORE'
 */
export function scoreKey(): string {
  return SCORE_SK;
}

// --- Match Predictions Keys (for scoring queries) ---

/**
 * Generate the PK for the denormalized match predictions partition.
 * @example matchPredictionsKey('m-2026-06-11-mex-usa') => 'MATCH_PREDS#m-2026-06-11-mex-usa'
 */
export function matchPredictionsKey(matchId: string): string {
  return `${MATCH_PREDS_PREFIX}${matchId}`;
}

// --- Leaderboard GSI Keys ---

/**
 * Generate the GSI1PK for leaderboard entries.
 * @returns 'LEADERBOARD'
 */
export function leaderboardGSIPK(): string {
  return LEADERBOARD_PK;
}

/**
 * Generate the GSI1SK for leaderboard entries with inverted score for descending sort.
 *
 * DynamoDB sorts GSI sort keys in ascending order. To achieve descending score order,
 * we invert the score: invertedScore = MAX_SCORE - actualScore, then zero-pad.
 *
 * Format: SCORE#{invertedScore}#{invertedExactCount}#{displayName}
 *
 * This ensures:
 * - Higher scores sort first (lower inverted value)
 * - Among equal scores, higher exact counts sort first (lower inverted value)
 * - Among equal scores and exact counts, alphabetical by display name
 *
 * @example leaderboardGSIKey(42, 5, 'Alice') => 'SCORE#99957#99994#Alice'
 */
export function leaderboardGSIKey(totalScore: number, exactScoreCount: number, displayName: string): string {
  const invertedScore = invertScore(totalScore);
  const invertedExact = invertScore(exactScoreCount);
  return `${SCORE_GSI_PREFIX}${invertedScore}#${invertedExact}#${displayName}`;
}

/**
 * Invert a score value for descending sort in DynamoDB.
 * Uses MAX_SCORE (99999) minus the actual value, zero-padded to 5 digits.
 *
 * @example invertScore(42) => '99957'
 * @example invertScore(0) => '99999'
 * @example invertScore(99999) => '00000'
 */
export function invertScore(score: number): string {
  const inverted = MAX_SCORE - score;
  return String(inverted).padStart(SCORE_PAD_WIDTH, '0');
}

// --- Key Parsing Utilities ---

/**
 * Extract the match ID from a match PK.
 * @example parseMatchId('MATCH#m-2026-06-11-mex-usa') => 'm-2026-06-11-mex-usa'
 */
export function parseMatchId(pk: string): string {
  return pk.replace(MATCH_PREFIX, '');
}

/**
 * Extract the user ID from a user PK.
 * @example parseUserId('USER#user-123') => 'user-123'
 */
export function parseUserId(pk: string): string {
  return pk.replace(USER_PREFIX, '');
}

/**
 * Extract the match ID from a prediction SK.
 * @example parsePredictionMatchId('PRED#MATCH#m-2026-06-11-mex-usa') => 'm-2026-06-11-mex-usa'
 */
export function parsePredictionMatchId(sk: string): string {
  return sk.replace(`${PRED_PREFIX}${MATCH_PREFIX}`, '');
}

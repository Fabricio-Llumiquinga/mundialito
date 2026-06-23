/**
 * DynamoDB access utilities for the MundialPredictions table.
 */

export {
  TABLE_NAME,
  TABLE_SCHEMA,
  GSI1_INDEX_NAME,
} from './table-schema';

export {
  matchKey,
  matchMetadataSK,
  userKey,
  predictionKey,
  tournamentWinnerPredictionKey,
  predictionPrefix,
  phaseKey,
  phaseMatchSK,
  scoreKey,
  matchPredictionsKey,
  leaderboardGSIPK,
  leaderboardGSIKey,
  invertScore,
  parseMatchId,
  parseUserId,
  parsePredictionMatchId,
} from './keys';

export {
  createDynamoDBClient,
  calculateBackoffDelay,
  getDefaultClient,
  resetDefaultClient,
  getTableName,
} from './client';

export type { DynamoDBClientConfig } from './client';

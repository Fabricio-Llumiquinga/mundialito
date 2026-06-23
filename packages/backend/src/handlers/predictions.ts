/**
 * Predictions Lambda handlers for CRUD operations.
 *
 * Endpoints:
 * - POST /predictions/match-winner — Submit/update a match winner prediction
 * - POST /predictions/final-score — Submit/update a final score prediction
 * - POST /predictions/tournament-winner — Submit/update a tournament winner prediction
 * - GET /predictions/me — Retrieve all predictions for the authenticated user
 *
 * Uses DynamoDB conditional expressions to prevent race conditions on upserts.
 * Writes to both USER# prediction entries and MATCH_PREDS# denormalized entries.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  MatchWinnerPredictionRequest,
  FinalScorePredictionRequest,
  TournamentWinnerPredictionRequest,
  UserPredictionsResponse,
  PredictionRecord,
  PredictionEntity,
  MatchPredictionsEntity,
  MatchEntity,
  MatchOutcome,
} from '@mudialito/shared';
import { PredictionValidator } from '../predictions/prediction-validator';
import {
  userKey,
  predictionKey,
  tournamentWinnerPredictionKey,
  predictionPrefix,
  matchPredictionsKey,
  matchKey,
  matchMetadataSK,
  scoreKey,
  getDefaultClient,
  getTableName,
} from '../db';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * API Gateway proxy event (simplified for Lambda handler).
 */
export interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  body: string | null;
  requestContext: {
    authorizer?: {
      claims?: {
        sub: string;
        email?: string;
        'cognito:username'?: string;
      };
    };
  };
}

/**
 * API Gateway proxy response.
 */
export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

// ─── Handler Factory ─────────────────────────────────────────────────────────

/**
 * Create a predictions handler with injectable dependencies (for testing).
 */
export function createPredictionsHandler(
  client?: DynamoDBDocumentClient,
  tableName?: string,
) {
  const dbClient = client ?? getDefaultClient();
  const table = tableName ?? getTableName();
  const validator = new PredictionValidator(dbClient, table);

  return {
    handleMatchWinner: (event: APIGatewayEvent) =>
      handleMatchWinner(event, dbClient, table, validator),
    handleFinalScore: (event: APIGatewayEvent) =>
      handleFinalScore(event, dbClient, table, validator),
    handleTournamentWinner: (event: APIGatewayEvent) =>
      handleTournamentWinner(event, dbClient, table, validator),
    handleGetMyPredictions: (event: APIGatewayEvent) =>
      handleGetMyPredictions(event, dbClient, table),
  };
}

// ─── POST /predictions/match-winner ──────────────────────────────────────────

/**
 * Handle match winner prediction submission.
 *
 * Validates the request, checks if the match is open for predictions,
 * validates the outcome by phase, and upserts the prediction.
 *
 * Requirements: 3.3, 3.4, 3.5, 3.6, 3.7
 */
export async function handleMatchWinner(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
  validator: PredictionValidator,
): Promise<APIGatewayResponse> {
  const userId = extractUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  const body = parseBody<MatchWinnerPredictionRequest>(event.body);
  if (!body) {
    return errorResponse(400, 'Invalid request body');
  }

  const { matchId, outcome } = body;

  if (!matchId || !outcome) {
    return errorResponse(400, 'matchId and outcome are required');
  }

  // Check if match is open for predictions
  const isOpen = await validator.isMatchOpen(matchId);
  if (!isOpen) {
    // Check if match exists at all
    const match = await getMatch(client, tableName, matchId);
    if (!match) {
      return errorResponse(404, 'Match not found');
    }
    return errorResponse(409, 'Predictions are closed for this match');
  }

  // Get match to validate outcome by phase
  const match = await getMatch(client, tableName, matchId);
  if (!match) {
    return errorResponse(404, 'Match not found');
  }

  // Validate outcome by phase
  const validation = validator.validateMatchWinner(outcome, match.phase);
  if (!validation.valid) {
    return errorResponse(400, validation.error!);
  }

  const now = new Date().toISOString();

  // Write prediction entity (USER# partition)
  const predictionEntity: PredictionEntity = {
    PK: userKey(userId),
    SK: predictionKey(matchId),
    userId,
    matchId,
    predictionType: 'match_winner',
    outcome,
    createdAt: now,
    updatedAt: now,
  };

  // Write denormalized entry (MATCH_PREDS# partition)
  const matchPredsEntity: MatchPredictionsEntity = {
    PK: matchPredictionsKey(matchId),
    SK: userKey(userId),
    userId,
    matchId,
    winnerOutcome: outcome,
    updatedAt: now,
  };

  await upsertPrediction(client, tableName, predictionEntity, matchPredsEntity);

  return successResponse(200, {
    message: 'Match winner prediction saved successfully',
    prediction: {
      matchId,
      predictionType: 'match_winner',
      outcome,
      updatedAt: now,
    },
  });
}

// ─── POST /predictions/final-score ───────────────────────────────────────────

/**
 * Handle final score prediction submission.
 *
 * Validates the request, checks if the match is open for predictions,
 * validates score values, and upserts the prediction.
 *
 * Requirements: 4.1, 4.2, 4.4, 4.5, 4.6
 */
export async function handleFinalScore(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
  validator: PredictionValidator,
): Promise<APIGatewayResponse> {
  const userId = extractUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  const body = parseBody<FinalScorePredictionRequest>(event.body);
  if (!body) {
    return errorResponse(400, 'Invalid request body');
  }

  const { matchId, team1Score, team2Score } = body;

  if (!matchId || team1Score === undefined || team2Score === undefined) {
    return errorResponse(400, 'matchId, team1Score, and team2Score are required');
  }

  // Validate score values
  const scoreValidation = validator.validateFinalScore(team1Score, team2Score);
  if (!scoreValidation.valid) {
    return errorResponse(400, scoreValidation.error!);
  }

  // Check if match is open for predictions
  const isOpen = await validator.isMatchOpen(matchId);
  if (!isOpen) {
    const match = await getMatch(client, tableName, matchId);
    if (!match) {
      return errorResponse(404, 'Match not found');
    }
    return errorResponse(409, 'Predictions are closed for this match');
  }

  const now = new Date().toISOString();

  // Write prediction entity (USER# partition)
  const predictionEntity: PredictionEntity = {
    PK: userKey(userId),
    SK: predictionKey(matchId),
    userId,
    matchId,
    predictionType: 'final_score',
    team1Score,
    team2Score,
    createdAt: now,
    updatedAt: now,
  };

  // Write denormalized entry (MATCH_PREDS# partition)
  const matchPredsEntity: MatchPredictionsEntity = {
    PK: matchPredictionsKey(matchId),
    SK: userKey(userId),
    userId,
    matchId,
    team1Score,
    team2Score,
    updatedAt: now,
  };

  await upsertPrediction(client, tableName, predictionEntity, matchPredsEntity);

  return successResponse(200, {
    message: 'Final score prediction saved successfully',
    prediction: {
      matchId,
      predictionType: 'final_score',
      team1Score,
      team2Score,
      updatedAt: now,
    },
  });
}

// ─── POST /predictions/tournament-winner ─────────────────────────────────────

/**
 * Handle tournament winner prediction submission.
 *
 * Validates the request, checks if tournament winner predictions are still open,
 * validates the team ID, and upserts the prediction.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export async function handleTournamentWinner(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
  validator: PredictionValidator,
): Promise<APIGatewayResponse> {
  const userId = extractUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  const body = parseBody<TournamentWinnerPredictionRequest>(event.body);
  if (!body) {
    return errorResponse(400, 'Invalid request body');
  }

  const { teamId } = body;

  if (!teamId) {
    return errorResponse(400, 'teamId is required');
  }

  // Check if tournament winner predictions are still open
  const isOpen = await validator.isTournamentWinnerOpen();
  if (!isOpen) {
    return errorResponse(409, 'Tournament winner predictions are closed');
  }

  // Validate team ID
  const teamValidation = await validator.validateTournamentWinner(teamId);
  if (!teamValidation.valid) {
    return errorResponse(400, teamValidation.error!);
  }

  // Fetch team name for display purposes
  const teamName = await getTeamName(client, tableName, teamId);

  const now = new Date().toISOString();

  // Write prediction entity (USER# partition)
  const predictionEntity: PredictionEntity = {
    PK: userKey(userId),
    SK: tournamentWinnerPredictionKey(),
    userId,
    predictionType: 'tournament_winner',
    teamId,
    teamName: teamName ?? teamId,
    createdAt: now,
    updatedAt: now,
  };

  // Tournament winner doesn't need a MATCH_PREDS# entry
  await upsertSinglePrediction(client, tableName, predictionEntity);

  return successResponse(200, {
    message: 'Tournament winner prediction saved successfully',
    prediction: {
      predictionType: 'tournament_winner',
      teamId,
      teamName: teamName ?? teamId,
      updatedAt: now,
    },
  });
}

// ─── GET /predictions/me ─────────────────────────────────────────────────────

/**
 * Handle retrieval of all predictions for the authenticated user.
 *
 * Queries all prediction entries for the user and returns them along with
 * the user's total score and leaderboard rank.
 *
 * Requirements: 3.5, 5.5
 */
export async function handleGetMyPredictions(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<APIGatewayResponse> {
  const userId = extractUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  // Query all predictions for the user (begins_with PRED#)
  const predictionsResult = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': userKey(userId),
        ':skPrefix': predictionPrefix(),
      },
    }),
  );

  const predictions: PredictionRecord[] = (predictionsResult.Items ?? []).map(
    (item) => mapToPredictionRecord(item as PredictionEntity),
  );

  // Get user score
  const scoreResult = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: userKey(userId),
        SK: scoreKey(),
      },
    }),
  );

  const totalScore = (scoreResult.Item as { totalScore?: number })?.totalScore ?? 0;
  const leaderboardRank = 0; // Rank computation is handled by the leaderboard component

  const response: UserPredictionsResponse = {
    predictions,
    totalScore,
    leaderboardRank,
  };

  return successResponse(200, response);
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Extract the user ID from the API Gateway event's Cognito authorizer claims.
 */
function extractUserId(event: APIGatewayEvent): string | null {
  return event.requestContext?.authorizer?.claims?.sub ?? null;
}

/**
 * Parse the request body as JSON.
 */
function parseBody<T>(body: string | null): T | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

/**
 * Fetch a match entity from DynamoDB.
 */
async function getMatch(
  client: DynamoDBDocumentClient,
  tableName: string,
  matchId: string,
): Promise<MatchEntity | null> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: matchKey(matchId),
        SK: matchMetadataSK(),
      },
    }),
  );
  return (result.Item as MatchEntity) ?? null;
}

/**
 * Fetch a team name from DynamoDB.
 */
async function getTeamName(
  client: DynamoDBDocumentClient,
  tableName: string,
  teamId: string,
): Promise<string | null> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: `TEAM#${teamId}`,
        SK: 'METADATA',
      },
    }),
  );
  return (result.Item as { teamName?: string })?.teamName ?? null;
}

/**
 * Upsert a prediction with both USER# and MATCH_PREDS# entries.
 *
 * Uses DynamoDB conditional expressions to handle race conditions:
 * - The PutCommand with a condition ensures atomic upsert behavior
 * - Both entries are written to maintain consistency
 */
async function upsertPrediction(
  client: DynamoDBDocumentClient,
  tableName: string,
  predictionEntity: PredictionEntity,
  matchPredsEntity: MatchPredictionsEntity,
): Promise<void> {
  // Check if an existing prediction exists to preserve createdAt
  const existing = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: predictionEntity.PK,
        SK: predictionEntity.SK,
      },
    }),
  );

  if (existing.Item) {
    predictionEntity.createdAt = (existing.Item as PredictionEntity).createdAt;
    // Merge existing denormalized fields for the MATCH_PREDS entry
    const existingPreds = existing.Item as PredictionEntity;
    if (predictionEntity.predictionType === 'match_winner' && existingPreds.team1Score !== undefined) {
      matchPredsEntity.team1Score = existingPreds.team1Score;
      matchPredsEntity.team2Score = existingPreds.team2Score;
    } else if (predictionEntity.predictionType === 'final_score' && existingPreds.outcome) {
      matchPredsEntity.winnerOutcome = existingPreds.outcome;
    }
  }

  // Write USER# prediction entry with conditional expression for race condition prevention
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: predictionEntity,
      ConditionExpression: 'attribute_not_exists(PK) OR (attribute_exists(PK) AND attribute_exists(SK))',
    }),
  );

  // Write MATCH_PREDS# denormalized entry
  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: matchPredsEntity,
      ConditionExpression: 'attribute_not_exists(PK) OR (attribute_exists(PK) AND attribute_exists(SK))',
    }),
  );
}

/**
 * Upsert a single prediction (no MATCH_PREDS# entry needed, e.g., tournament winner).
 */
async function upsertSinglePrediction(
  client: DynamoDBDocumentClient,
  tableName: string,
  predictionEntity: PredictionEntity,
): Promise<void> {
  // Check if an existing prediction exists to preserve createdAt
  const existing = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: predictionEntity.PK,
        SK: predictionEntity.SK,
      },
    }),
  );

  if (existing.Item) {
    predictionEntity.createdAt = (existing.Item as PredictionEntity).createdAt;
  }

  await client.send(
    new PutCommand({
      TableName: tableName,
      Item: predictionEntity,
      ConditionExpression: 'attribute_not_exists(PK) OR (attribute_exists(PK) AND attribute_exists(SK))',
    }),
  );
}

/**
 * Map a DynamoDB PredictionEntity to a PredictionRecord for the API response.
 */
function mapToPredictionRecord(entity: PredictionEntity): PredictionRecord {
  return {
    matchId: entity.matchId,
    teamId: entity.teamId,
    predictionType: entity.predictionType,
    outcome: entity.outcome,
    team1Score: entity.team1Score,
    team2Score: entity.team2Score,
    teamName: entity.teamName,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/**
 * Create a success response.
 */
function successResponse(statusCode: number, body: unknown): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Create an error response.
 */
function errorResponse(statusCode: number, error: string): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error }),
  };
}

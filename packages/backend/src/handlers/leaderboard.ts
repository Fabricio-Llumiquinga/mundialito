/**
 * Leaderboard Lambda handler.
 *
 * Endpoint:
 * - GET /leaderboard — Retrieve ranked list of all users by total score
 *
 * Queries GSI1 with PK=LEADERBOARD to get all users sorted by inverted score.
 * Computes rank positions with tiebreaker logic:
 * - Higher total score ranks first
 * - Among tied scores, higher exact score count ranks first
 * - Among tied scores and exact counts, users share the same rank and are ordered alphabetically
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LeaderboardResponse, LeaderboardEntry, UserScoreEntity } from '@mudialito/shared';
import {
  leaderboardGSIPK,
  GSI1_INDEX_NAME,
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
 * Create a leaderboard handler with injectable dependencies (for testing).
 */
export function createLeaderboardHandler(
  client?: DynamoDBDocumentClient,
  tableName?: string,
) {
  const dbClient = client ?? getDefaultClient();
  const table = tableName ?? getTableName();

  return {
    handleGetLeaderboard: (event: APIGatewayEvent) =>
      handleGetLeaderboard(event, dbClient, table),
  };
}

// ─── GET /leaderboard ────────────────────────────────────────────────────────

/**
 * Handle leaderboard retrieval.
 *
 * Queries GSI1 to get all user scores sorted by inverted score (descending order).
 * Computes rank positions with tiebreaker logic:
 * - Users with higher total scores get lower rank numbers
 * - Among users with equal total scores, those with more exact score predictions rank higher
 * - Users with same score AND same exact count share the same rank, ordered alphabetically
 * - Marks the current user's entry with isCurrentUser: true
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */
export async function handleGetLeaderboard(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<APIGatewayResponse> {
  const userId = extractUserId(event);
  if (!userId) {
    return errorResponse(401, 'Authentication required');
  }

  // Query GSI1 to get all leaderboard entries sorted by inverted score
  const items = await queryAllLeaderboardItems(client, tableName);

  // Compute ranks with tiebreaker logic
  const entries = computeRankedEntries(items, userId);

  // Find current user's rank
  const currentUserEntry = entries.find((e) => e.isCurrentUser);
  const currentUserRank = currentUserEntry?.rank ?? 0;

  const response: LeaderboardResponse = {
    entries,
    currentUserRank,
  };

  return successResponse(200, response);
}

// ─── Core Logic (exported for testing) ───────────────────────────────────────

/**
 * Compute ranked leaderboard entries from raw user score items.
 *
 * The items come pre-sorted from DynamoDB GSI1 by inverted score (ascending),
 * which means they are already in descending score order. The tiebreaker
 * (exact score count, then alphabetical) is also encoded in the GSI1SK.
 *
 * Rank assignment:
 * - Users with the same totalScore AND same exactScoreCount share the same rank
 * - The next distinct group gets rank = position (1-indexed) of the first user in that group
 *
 * @param items - User score entities from GSI1 query (pre-sorted)
 * @param currentUserId - The authenticated user's ID
 * @returns Ranked leaderboard entries
 */
export function computeRankedEntries(
  items: UserScoreEntity[],
  currentUserId: string,
): LeaderboardEntry[] {
  if (items.length === 0) {
    return [];
  }

  const entries: LeaderboardEntry[] = [];
  let currentRank = 1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Determine if this user shares rank with the previous user
    if (i > 0) {
      const prev = items[i - 1];
      if (item.totalScore === prev.totalScore && item.exactScoreCount === prev.exactScoreCount) {
        // Same rank as previous (tied)
      } else {
        // New rank = current position (1-indexed)
        currentRank = i + 1;
      }
    }

    entries.push({
      rank: currentRank,
      userId: item.userId,
      displayName: item.displayName,
      totalScore: item.totalScore,
      exactScoreCount: item.exactScoreCount,
      isCurrentUser: item.userId === currentUserId,
    });
  }

  return entries;
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Query all leaderboard items from GSI1, handling pagination.
 *
 * DynamoDB returns items sorted by GSI1SK in ascending order.
 * Since GSI1SK uses inverted scores, this gives us descending score order.
 */
async function queryAllLeaderboardItems(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<UserScoreEntity[]> {
  const items: UserScoreEntity[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: GSI1_INDEX_NAME,
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': leaderboardGSIPK(),
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as UserScoreEntity[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Extract the user ID from the API Gateway event's Cognito authorizer claims.
 */
function extractUserId(event: APIGatewayEvent): string | null {
  return event.requestContext?.authorizer?.claims?.sub ?? null;
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

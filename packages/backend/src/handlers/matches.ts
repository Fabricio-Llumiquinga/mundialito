/**
 * Match Schedule Lambda handler.
 *
 * Endpoint:
 * - GET /matches — Retrieve match schedule with optional filtering
 *
 * Query Parameters:
 * - phase (optional): Filter by tournament phase (e.g., 'group_stage', 'round_of_32')
 * - group (optional): Filter by group (A-L), only valid when phase is 'group_stage'
 *
 * Computes match status dynamically:
 * - "upcoming": current time is before the scheduled match start time
 * - "in_progress": current time is at or after the scheduled match start time and no final result recorded
 * - "completed": a final result has been recorded for the match
 *
 * Returns matches in chronological ascending order by date.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  MatchesResponse,
  MatchView,
  PhaseIndexEntity,
  TournamentPhase,
  MatchStatus,
} from '@mudialito/shared';
import { phaseKey, getDefaultClient, getTableName } from '../db';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * API Gateway proxy event (simplified for Lambda handler).
 */
export interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  queryStringParameters?: Record<string, string> | null;
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

/**
 * All tournament phases in chronological order.
 */
const ALL_PHASES: TournamentPhase[] = [
  'group_stage',
  'round_of_32',
  'round_of_16',
  'quarter_finals',
  'semi_finals',
  'third_place',
  'final',
];

// ─── Handler Factory ─────────────────────────────────────────────────────────

/**
 * Create a matches handler with injectable dependencies (for testing).
 */
export function createMatchesHandler(
  client?: DynamoDBDocumentClient,
  tableName?: string,
  nowFn?: () => Date,
) {
  const dbClient = client ?? getDefaultClient();
  const table = tableName ?? getTableName();
  const getCurrentTime = nowFn ?? (() => new Date());

  return {
    handleGetMatches: (event: APIGatewayEvent) =>
      handleGetMatches(event, dbClient, table, getCurrentTime),
  };
}

// ─── GET /matches ────────────────────────────────────────────────────────────

/**
 * Handle match schedule retrieval with optional filtering.
 *
 * - When `phase` is provided, queries only that phase's partition
 * - When `group` is also provided (and phase is 'group_stage'), queries the group-specific partition
 * - When no filters are applied, queries all phases and combines results
 * - Returns matches sorted chronologically (ascending by date)
 * - Computes match status dynamically based on current time
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */
export async function handleGetMatches(
  event: APIGatewayEvent,
  client: DynamoDBDocumentClient,
  tableName: string,
  getCurrentTime: () => Date,
): Promise<APIGatewayResponse> {
  const params = event.queryStringParameters ?? {};
  const phase = params.phase as TournamentPhase | undefined;
  const group = params.group?.toUpperCase();

  // Validate phase parameter if provided
  if (phase && !ALL_PHASES.includes(phase)) {
    return errorResponse(400, `Invalid phase: ${phase}. Valid phases are: ${ALL_PHASES.join(', ')}`);
  }

  // Validate group parameter
  if (group && !phase) {
    return errorResponse(400, 'Group filter requires phase to be set to group_stage');
  }
  if (group && phase !== 'group_stage') {
    return errorResponse(400, 'Group filter is only valid for group_stage phase');
  }
  if (group && !/^[A-L]$/.test(group)) {
    return errorResponse(400, 'Invalid group: must be a single letter A through L');
  }

  let items: PhaseIndexEntity[];

  if (phase) {
    // Query specific phase (with optional group filter)
    const pk = phaseKey(phase, group);
    items = await queryPhaseItems(client, tableName, pk);
  } else {
    // No filters: query all phases and combine
    items = await queryAllPhases(client, tableName);
  }

  const now = getCurrentTime();
  const matches = items.map((item) => toMatchView(item, now));

  const response: MatchesResponse = {
    matches,
    totalCount: matches.length,
  };

  return successResponse(200, response);
}

// ─── Core Logic (exported for testing) ───────────────────────────────────────

/**
 * Compute match status dynamically based on current time and result availability.
 *
 * - "completed": a final result has been recorded (team1Score and team2Score are defined)
 * - "in_progress": current time is at or after the scheduled start and no result recorded
 * - "upcoming": current time is before the scheduled start time
 *
 * @param date - Match date in ISO 8601 format (YYYY-MM-DD)
 * @param time - Match time in HH:mm UTC format
 * @param team1Score - Final score for team 1 (undefined if no result)
 * @param team2Score - Final score for team 2 (undefined if no result)
 * @param now - Current time
 * @returns Computed match status
 */
export function computeMatchStatus(
  date: string,
  time: string,
  team1Score: number | undefined,
  team2Score: number | undefined,
  now: Date,
): MatchStatus {
  // If scores are recorded, the match is completed
  if (team1Score !== undefined && team2Score !== undefined) {
    return 'completed';
  }

  // Parse the match start time
  const matchStart = parseMatchDateTime(date, time);

  // If current time is at or after the scheduled start, it's in progress
  if (now >= matchStart) {
    return 'in_progress';
  }

  // Otherwise, it's upcoming
  return 'upcoming';
}

/**
 * Parse a match date and time into a Date object.
 * @param date - ISO 8601 date string (YYYY-MM-DD)
 * @param time - Time string in HH:mm format (UTC)
 * @returns Date object representing the match start time in UTC
 */
export function parseMatchDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00Z`);
}

/**
 * Convert a PhaseIndexEntity to a MatchView response object.
 */
export function toMatchView(item: PhaseIndexEntity, now: Date): MatchView {
  const status = computeMatchStatus(item.date, item.time, item.team1Score, item.team2Score, now);

  // Extract phase and group from the PK
  const { phase, group } = parsePhaseFromPK(item.PK);

  const matchView: MatchView = {
    matchId: item.matchId,
    team1: {
      teamId: slugify(item.team1Name),
      teamName: item.team1Name,
    },
    team2: {
      teamId: slugify(item.team2Name),
      teamName: item.team2Name,
    },
    date: item.date,
    time: item.time,
    venue: item.venue,
    phase,
    status,
  };

  // Include group for group stage matches
  if (group) {
    matchView.group = group;
  }

  // Include result for completed matches
  if (status === 'completed' && item.team1Score !== undefined && item.team2Score !== undefined) {
    matchView.result = {
      team1Score: item.team1Score,
      team2Score: item.team2Score,
    };
  }

  return matchView;
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Query all items for a specific phase partition, handling pagination.
 * Items are returned sorted by SK (MATCH#{date}#{matchId}) which gives chronological order.
 */
async function queryPhaseItems(
  client: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
): Promise<PhaseIndexEntity[]> {
  const items: PhaseIndexEntity[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if (result.Items) {
      items.push(...(result.Items as PhaseIndexEntity[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Query all phases and combine results in chronological order.
 * Queries each phase partition separately and merges results sorted by date.
 */
async function queryAllPhases(
  client: DynamoDBDocumentClient,
  tableName: string,
): Promise<PhaseIndexEntity[]> {
  // Query all phase partitions in parallel
  const phaseQueries = ALL_PHASES.map((phase) =>
    queryPhaseItems(client, tableName, phaseKey(phase)),
  );

  const results = await Promise.all(phaseQueries);

  // Flatten all results
  const allItems = results.flat();

  // Sort by date and then by SK for consistent chronological ordering
  allItems.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    // Same date: compare by time
    return a.time.localeCompare(b.time);
  });

  return allItems;
}

/**
 * Parse phase and group from a PhaseIndexEntity PK.
 * PK format: "PHASE#{phase}" or "PHASE#{phase}#GROUP#{group}"
 */
export function parsePhaseFromPK(pk: string): { phase: TournamentPhase; group?: string } {
  // Remove "PHASE#" prefix
  const withoutPrefix = pk.replace('PHASE#', '');

  // Check if it contains a group
  const groupMatch = withoutPrefix.match(/^(.+)#GROUP#([A-L])$/);
  if (groupMatch) {
    return {
      phase: groupMatch[1] as TournamentPhase,
      group: groupMatch[2],
    };
  }

  return { phase: withoutPrefix as TournamentPhase };
}

/**
 * Convert a team name to a URL-safe slug for use as team ID.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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

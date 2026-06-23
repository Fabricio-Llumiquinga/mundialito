/**
 * Lambda Function URL handler for predictions API.
 * Validates JWT token from Cognito, reads/writes predictions to DynamoDB.
 * No API Gateway - direct Lambda URL with CORS.
 *
 * Deadline rule: Predictions for matches on a given day are locked at
 * 8:00 AM Costa Rica time (CST = UTC-6) → 14:00 UTC of that day.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import gamesData from '../data/games.json';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'MundialPredictions';
const SPA_BUCKET = process.env.SPA_BUCKET_NAME ?? '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
};

// ─── Match Schedule (loaded at cold start) ───────────────────────────────────

interface GameRecord {
  id: string;
  local_date: string; // "MM/DD/YYYY HH:MM"
}

/**
 * Build a map of matchId → match date (YYYY-MM-DD) from games.json.
 * matchId format in frontend: "wc-{id}"
 */
const matchDateMap: Record<string, string> = {};
for (const game of (gamesData as { games: GameRecord[] }).games) {
  const [datePart] = (game.local_date ?? '').split(' ');
  const [month, day, year] = (datePart ?? '').split('/');
  if (year && month && day) {
    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    matchDateMap[`wc-${game.id}`] = isoDate;
  }
}

/**
 * Check if predictions are locked for a given matchId.
 * Deadline: 8:00 AM Costa Rica (UTC-6) = 14:00 UTC of the match date.
 */
function isPredictionLocked(matchId: string): boolean {
  const matchDate = matchDateMap[matchId];
  if (!matchDate) return false; // Unknown match, allow (shouldn't happen)

  const [year, month, day] = matchDate.split('-').map(Number);
  const deadline = new Date(Date.UTC(year, month - 1, day, 14, 0, 0)); // 14:00 UTC = 8AM CST
  return Date.now() >= deadline.getTime();
}

interface LambdaEvent {
  requestContext?: { http?: { method: string; path: string } };
  headers?: Record<string, string>;
  body?: string;
  rawPath?: string;
}

export async function handler(event: LambdaEvent) {
  const method = event.requestContext?.http?.method ?? 'GET';
  const path = event.rawPath ?? '/';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  // Extract and validate user from JWT
  const authHeader = event.headers?.authorization ?? event.headers?.Authorization ?? '';
  const token = authHeader.replace('Bearer ', '');

  if (!token) {
    return respond(401, { error: 'Token requerido' });
  }

  let userId: string;
  let userEmail: string;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    userId = payload.sub;
    userEmail = payload.email ?? payload['cognito:username'] ?? '';
    // Check expiration
    if (payload.exp * 1000 < Date.now()) {
      return respond(401, { error: 'Token expirado' });
    }
  } catch {
    return respond(401, { error: 'Token inválido' });
  }

  // Route
  try {
    if (method === 'GET' && path.includes('/predictions')) {
      return await getUserPredictions(userId);
    }
    if (method === 'POST' && path.includes('/predict')) {
      const body = JSON.parse(event.body ?? '{}');
      return await savePrediction(userId, userEmail, body);
    }
    if (method === 'GET' && path.includes('/leaderboard')) {
      return await getLeaderboard(userId);
    }
    return respond(404, { error: 'Ruta no encontrada' });
  } catch (err: any) {
    console.error('Error:', err);
    return respond(500, { error: 'Error interno' });
  }
}

// ─── Get user predictions ────────────────────────────────────────────────────

async function getUserPredictions(userId: string) {
  // Get user's predictions
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':prefix': 'PRED#',
    },
  }));

  // Get user's leaderboard entry for totalScore and rank
  let totalScore = 0;
  let leaderboardRank = 0;
  try {
    const lbResult = await client.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${userId}`, SK: 'LEADERBOARD' },
    }));
    if (lbResult.Item) {
      totalScore = lbResult.Item.totalScore ?? 0;
    }

    // Get rank by querying all leaderboard entries
    const allLb = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': 'LEADERBOARD' },
    }));
    const entries = allLb.Items ?? [];
    const userIdx = entries.findIndex((e: any) => e.userId === userId);
    leaderboardRank = userIdx >= 0 ? userIdx + 1 : 0;
  } catch {
    // Non-fatal
  }

  // Build results map from live games data (fetched from S3)
  let resultsMap: Record<string, { homeScore: number; awayScore: number; winner: string }> = {};
  try {
    const s3Result = await s3.send(new GetObjectCommand({
      Bucket: SPA_BUCKET,
      Key: 'data/games.json',
    }));
    const body = await s3Result.Body?.transformToString();
    const liveGames = body ? JSON.parse(body) : { games: [] };
    for (const game of liveGames.games) {
      if (game.time_elapsed === 'finished' || game.finished === 'TRUE') {
        const homeScore = parseInt(game.home_score, 10) || 0;
        const awayScore = parseInt(game.away_score, 10) || 0;
        let winner: string;
        if (homeScore > awayScore) winner = 'team1';
        else if (awayScore > homeScore) winner = 'team2';
        else winner = 'draw';
        resultsMap[`wc-${game.id}`] = { homeScore, awayScore, winner };
      }
    }
  } catch {
    // If S3 fails, fall back to embedded data
    for (const game of (gamesData as { games: any[] }).games) {
      if (game.time_elapsed === 'finished' || game.finished === 'TRUE') {
        const homeScore = parseInt(game.home_score, 10) || 0;
        const awayScore = parseInt(game.away_score, 10) || 0;
        let winner: string;
        if (homeScore > awayScore) winner = 'team1';
        else if (awayScore > homeScore) winner = 'team2';
        else winner = 'draw';
        resultsMap[`wc-${game.id}`] = { homeScore, awayScore, winner };
      }
    }
  }

  const predictions = (result.Items ?? []).map((item: any) => {
    const pred: any = {
      matchId: item.matchId,
      predictionType: item.predictionType,
      outcome: item.outcome,
      team1Score: item.team1Score,
      team2Score: item.team2Score,
      teamId: item.teamId,
      teamName: item.teamName,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isCorrect: false,
      pointsEarned: 0,
    };

    const matchResult = item.matchId ? resultsMap[item.matchId] : null;
    if (matchResult) {
      pred.actualResult = { team1Score: matchResult.homeScore, team2Score: matchResult.awayScore };

      if (item.predictionType === 'match_winner') {
        if (item.outcome === matchResult.winner) {
          pred.isCorrect = true;
          pred.pointsEarned = 3;
        }
      } else if (item.predictionType === 'final_score') {
        if (item.team1Score === matchResult.homeScore && item.team2Score === matchResult.awayScore) {
          pred.isCorrect = true;
          pred.pointsEarned = 5;
        }
      }
    }

    return pred;
  });

  return respond(200, { predictions, totalScore, leaderboardRank });
}

// ─── Save prediction ─────────────────────────────────────────────────────────

async function savePrediction(userId: string, userEmail: string, body: any) {
  const { matchId, predictionType, outcome, team1Score, team2Score, teamId, teamName } = body;

  if (!predictionType) {
    return respond(400, { error: 'predictionType es requerido' });
  }

  // Deadline validation: block predictions at 8:00 AM Costa Rica (14:00 UTC) on match day
  if (predictionType !== 'tournament_winner' && matchId) {
    if (isPredictionLocked(matchId)) {
      return respond(403, { error: 'Predicciones cerradas. Se bloquean a las 8:00 AM (hora Costa Rica) del día del partido.' });
    }
  }

  const now = new Date().toISOString();
  let SK: string;

  if (predictionType === 'tournament_winner') {
    SK = 'PRED#TOURNAMENT_WINNER';
  } else if (!matchId) {
    return respond(400, { error: 'matchId es requerido' });
  } else {
    SK = `PRED#MATCH#${matchId}#${predictionType}`;
  }

  const item: any = {
    PK: `USER#${userId}`,
    SK,
    userId,
    userEmail,
    matchId,
    predictionType,
    createdAt: now,
    updatedAt: now,
  };

  if (outcome) item.outcome = outcome;
  if (team1Score !== undefined) item.team1Score = team1Score;
  if (team2Score !== undefined) item.team2Score = team2Score;
  if (teamId) item.teamId = teamId;
  if (teamName) item.teamName = teamName;

  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  return respond(200, { message: 'Predicción guardada', prediction: item });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

async function getLeaderboard(currentUserId: string) {
  // Scan all users with predictions (simple approach for now)
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'LEADERBOARD',
    },
  }));

  const entries = (result.Items ?? []).map((item: any, idx: number) => ({
    rank: idx + 1,
    userId: item.userId,
    displayName: item.displayName ?? item.userEmail ?? 'Anónimo',
    totalScore: item.totalScore ?? 0,
    exactScoreCount: item.exactScoreCount ?? 0,
    isCurrentUser: item.userId === currentUserId,
  }));

  const currentRank = entries.find((e: any) => e.isCurrentUser)?.rank ?? 0;

  return respond(200, { entries, currentUserRank: currentRank });
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function respond(statusCode: number, body: any) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Lambda handler that syncs games data from worldcup26.ir to S3
 * and recalculates the leaderboard scoring.
 * Triggered by EventBridge every 2 hours.
 *
 * 1. Fetches latest games from https://worldcup26.ir/get/games
 * 2. Validates the response structure
 * 3. Uploads to S3 as data/games.json
 * 4. Invalidates CloudFront cache for /data/games.json
 * 5. Scores all finished matches against user predictions
 * 6. Writes leaderboard entries to DynamoDB GSI1
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUCKET_NAME = process.env.SPA_BUCKET_NAME ?? '';
const DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID ?? '';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'MundialPredictions';
const WORLDCUP_API = 'https://worldcup26.ir/get/games';

// Scoring points
const POINTS_MATCH_WINNER = 3;
const POINTS_EXACT_SCORE = 5;

interface GameData {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  finished: string;
  time_elapsed: string;
  type: string;
}

interface SyncResult {
  success: boolean;
  gamesCount: number;
  scoredMatches: number;
  usersScored: number;
  message: string;
  timestamp: string;
}

export async function handler(): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  console.log(`[sync-games] Starting sync at ${timestamp}`);

  // 1. Fetch from worldcup26.ir
  let data: any;
  let games: GameData[] = [];
  try {
    const response = await fetch(WORLDCUP_API);
    if (!response.ok) throw new Error(`API responded with ${response.status}`);
    data = await response.json();
    games = data.games ?? [];
  } catch (err: any) {
    console.error('[sync-games] Failed to fetch:', err.message);
    return { success: false, gamesCount: 0, scoredMatches: 0, usersScored: 0, message: `Fetch failed: ${err.message}`, timestamp };
  }

  if (!Array.isArray(games) || games.length === 0) {
    return { success: false, gamesCount: 0, scoredMatches: 0, usersScored: 0, message: 'Invalid response', timestamp };
  }

  console.log(`[sync-games] Fetched ${games.length} games`);

  // 2. Upload to S3
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'data/games.json',
      Body: JSON.stringify(data),
      ContentType: 'application/json',
      CacheControl: 'max-age=3600',
    }));
  } catch (err: any) {
    console.error('[sync-games] S3 upload failed:', err.message);
    return { success: false, gamesCount: games.length, scoredMatches: 0, usersScored: 0, message: `S3 failed: ${err.message}`, timestamp };
  }

  // 3. Invalidate CloudFront
  if (DISTRIBUTION_ID) {
    try {
      await cloudfront.send(new CreateInvalidationCommand({
        DistributionId: DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `sync-${Date.now()}`,
          Paths: { Quantity: 1, Items: ['/data/games.json'] },
        },
      }));
    } catch (err: any) {
      console.warn('[sync-games] CloudFront invalidation failed (non-fatal):', err.message);
    }
  }

  // 4. Score finished matches
  const finishedGames = games.filter(g => g.time_elapsed === 'finished' || g.finished === 'TRUE');
  console.log(`[sync-games] ${finishedGames.length} finished games to score`);

  if (finishedGames.length === 0) {
    return { success: true, gamesCount: games.length, scoredMatches: 0, usersScored: 0, message: 'Synced, no finished games to score', timestamp };
  }

  // Build results map: matchId → { homeScore, awayScore, winner }
  const resultsMap: Record<string, { homeScore: number; awayScore: number; winner: string }> = {};
  for (const game of finishedGames) {
    const homeScore = parseInt(game.home_score, 10) || 0;
    const awayScore = parseInt(game.away_score, 10) || 0;
    let winner: string;
    if (homeScore > awayScore) winner = 'team1';
    else if (awayScore > homeScore) winner = 'team2';
    else winner = 'draw';

    resultsMap[`wc-${game.id}`] = { homeScore, awayScore, winner };
  }

  // 5. Scan all user predictions
  const allPredictions: any[] = [];
  let lastKey: any = undefined;
  do {
    const scanResult: any = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(PK, :prefix) AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':prefix': 'USER#', ':sk': 'PRED#' },
      ExclusiveStartKey: lastKey,
    }));
    allPredictions.push(...(scanResult.Items ?? []));
    lastKey = scanResult.LastEvaluatedKey;
  } while (lastKey);

  console.log(`[sync-games] Found ${allPredictions.length} predictions`);

  // 6. Calculate scores per user
  const userScores: Record<string, { totalScore: number; exactScoreCount: number; email: string }> = {};

  for (const pred of allPredictions) {
    const userId = pred.userId as string;
    const email = pred.userEmail as string;
    const matchId = pred.matchId as string;
    const predType = pred.predictionType as string;

    if (!userId || !matchId) continue;

    // Initialize user
    if (!userScores[userId]) {
      userScores[userId] = { totalScore: 0, exactScoreCount: 0, email };
    }

    const result = resultsMap[matchId];
    if (!result) continue; // Match not finished yet

    if (predType === 'match_winner') {
      const outcome = pred.outcome as string;
      if (outcome === result.winner) {
        userScores[userId].totalScore += POINTS_MATCH_WINNER;
      }
    } else if (predType === 'final_score') {
      const t1 = pred.team1Score as number;
      const t2 = pred.team2Score as number;
      if (t1 === result.homeScore && t2 === result.awayScore) {
        userScores[userId].totalScore += POINTS_EXACT_SCORE;
        userScores[userId].exactScoreCount += 1;
      }
    }
    // tournament_winner scored only at end of tournament
  }

  // 7. Write leaderboard entries to DynamoDB (GSI1PK = LEADERBOARD)
  const userIds = Object.keys(userScores);
  console.log(`[sync-games] Writing leaderboard for ${userIds.length} users`);

  // Sort by score descending, then exactScoreCount descending, then email
  const sorted = userIds
    .map(uid => ({ userId: uid, ...userScores[uid] }))
    .sort((a, b) => b.totalScore - a.totalScore || b.exactScoreCount - a.exactScoreCount || a.email.localeCompare(b.email));

  // Write in batches of 25 (DynamoDB limit)
  for (let i = 0; i < sorted.length; i += 25) {
    const batch = sorted.slice(i, i + 25);
    const putRequests = batch.map((entry, idx) => ({
      PutRequest: {
        Item: {
          PK: `USER#${entry.userId}`,
          SK: 'LEADERBOARD',
          GSI1PK: 'LEADERBOARD',
          GSI1SK: `SCORE#${String(99999 - entry.totalScore).padStart(5, '0')}#${String(99999 - entry.exactScoreCount).padStart(5, '0')}#${entry.email}`,
          userId: entry.userId,
          userEmail: entry.email,
          displayName: entry.email.split('@')[0],
          totalScore: entry.totalScore,
          exactScoreCount: entry.exactScoreCount,
          updatedAt: timestamp,
        },
      },
    }));

    await ddb.send(new BatchWriteCommand({
      RequestItems: { [TABLE_NAME]: putRequests },
    }));
  }

  return {
    success: true,
    gamesCount: games.length,
    scoredMatches: finishedGames.length,
    usersScored: sorted.length,
    message: `Synced ${games.length} games, scored ${finishedGames.length} matches for ${sorted.length} users`,
    timestamp,
  };
}

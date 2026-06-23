/**
 * Ingestion service that orchestrates data fetch, validation, and storage.
 *
 * Responsibilities:
 * - Fetch match data from a configured MatchDataSource
 * - Validate each record for required fields
 * - Skip invalid records and collect reasons
 * - Write valid matches to DynamoDB (MATCH# and PHASE# entries)
 * - Detect and store match results when score.ft is present
 * - Idempotent writes using match ID as key
 */

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { MatchEntity, PhaseIndexEntity } from '@mudialito/shared';
import {
  matchKey,
  matchMetadataSK,
  phaseKey,
  phaseMatchSK,
  getDefaultClient,
  getTableName,
} from '../db';
import { MatchDataSource, RawMatchData } from './types';

/**
 * Result of an ingestion run.
 */
export interface IngestionResult {
  totalFetched: number;
  totalStored: number;
  skipped: SkippedRecord[];
  resultsUpdated: number;
}

/**
 * A record that was skipped during ingestion with the reason.
 */
export interface SkippedRecord {
  reason: string;
  rawData: unknown;
}

/**
 * Required fields for a valid match record.
 */
const REQUIRED_FIELDS: (keyof RawMatchData)[] = ['team1', 'team2', 'date', 'time', 'venue'];

/**
 * Validates a raw match record for required fields.
 * Returns null if valid, or a reason string if invalid.
 */
export function validateMatchRecord(record: RawMatchData): string | null {
  for (const field of REQUIRED_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

/**
 * IngestionService orchestrates fetching match data from a source,
 * validating records, and writing them to DynamoDB.
 */
export class IngestionService {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(client?: DynamoDBDocumentClient, tableName?: string) {
    this.client = client ?? getDefaultClient();
    this.tableName = tableName ?? getTableName();
  }

  /**
   * Ingest matches from the given data source.
   * Fetches, validates, and stores match data in DynamoDB.
   */
  async ingestMatches(source: MatchDataSource): Promise<IngestionResult> {
    const rawMatches = await source.fetchMatches();

    const result: IngestionResult = {
      totalFetched: rawMatches.length,
      totalStored: 0,
      skipped: [],
      resultsUpdated: 0,
    };

    for (const rawMatch of rawMatches) {
      const validationError = validateMatchRecord(rawMatch);

      if (validationError) {
        const skipped: SkippedRecord = {
          reason: validationError,
          rawData: rawMatch,
        };
        result.skipped.push(skipped);
        console.warn(
          `[IngestionService] Skipping record from ${source.getName()}: ${validationError}`,
          rawMatch
        );
        continue;
      }

      const hasResult = rawMatch.score?.ft !== undefined;

      await this.writeMatchToDynamoDB(rawMatch);
      result.totalStored++;

      if (hasResult) {
        result.resultsUpdated++;
      }
    }

    return result;
  }

  /**
   * Write a validated match record to DynamoDB.
   * Creates both the MATCH# entity and the PHASE# index entry.
   * Uses PutItem for idempotent writes (overwrites existing item with same key).
   */
  private async writeMatchToDynamoDB(rawMatch: RawMatchData): Promise<void> {
    const now = new Date().toISOString();
    const matchId = rawMatch.matchId;

    // Determine match status based on result availability
    const status = rawMatch.score?.ft ? 'completed' : 'upcoming';

    // Build the MATCH# entity
    const matchEntity: MatchEntity = {
      PK: matchKey(matchId),
      SK: matchMetadataSK(),
      matchId,
      team1Id: this.slugify(rawMatch.team1),
      team1Name: rawMatch.team1,
      team2Id: this.slugify(rawMatch.team2),
      team2Name: rawMatch.team2,
      date: rawMatch.date,
      time: rawMatch.time,
      venue: rawMatch.venue,
      phase: rawMatch.phase,
      group: rawMatch.group,
      status,
      lastUpdated: now,
    };

    // Add score fields if result is available
    if (rawMatch.score?.ft) {
      matchEntity.team1Score = rawMatch.score.ft[0];
      matchEntity.team2Score = rawMatch.score.ft[1];
    }

    // Add penalty winner if available
    if (rawMatch.penaltyWinner) {
      matchEntity.penaltyWinner = rawMatch.penaltyWinner;
    }

    // Build the PHASE# index entity
    const phaseEntity: PhaseIndexEntity = {
      PK: phaseKey(rawMatch.phase, rawMatch.group),
      SK: phaseMatchSK(rawMatch.date, matchId),
      matchId,
      team1Name: rawMatch.team1,
      team2Name: rawMatch.team2,
      date: rawMatch.date,
      time: rawMatch.time,
      venue: rawMatch.venue,
      status,
    };

    // Add score to phase entity if available
    if (rawMatch.score?.ft) {
      phaseEntity.team1Score = rawMatch.score.ft[0];
      phaseEntity.team2Score = rawMatch.score.ft[1];
    }

    // Write both entities (idempotent PutItem)
    await Promise.all([
      this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: matchEntity,
        })
      ),
      this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: phaseEntity,
        })
      ),
    ]);
  }

  /**
   * Convert a team name to a URL-safe slug for use as team ID.
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}

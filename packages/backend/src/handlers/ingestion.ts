/**
 * EventBridge-triggered Lambda handler for match data ingestion.
 *
 * Triggered every 6 hours by an EventBridge rule to fetch match data
 * from the configured data source and store it in DynamoDB.
 *
 * Handles data source unavailability gracefully by returning cached data
 * with a stale flag.
 *
 * Requirements: 2.6, 2.7
 */

import { OpenFootballAdapter } from '../ingestion/open-football-adapter';
import { IngestionService, IngestionResult } from '../ingestion/ingestion-service';

/**
 * EventBridge scheduled event structure.
 */
export interface EventBridgeEvent {
  'detail-type': string;
  source: string;
  time: string;
  detail: Record<string, unknown>;
}

/**
 * Response returned by the ingestion Lambda handler.
 */
export interface IngestionHandlerResponse {
  statusCode: number;
  body: {
    success: boolean;
    result?: IngestionResult;
    dataStale?: boolean;
    error?: string;
    timestamp: string;
  };
}

/**
 * Lambda handler for scheduled match data ingestion.
 *
 * Instantiates the OpenFootballAdapter and IngestionService,
 * fetches match data, and stores valid records in DynamoDB.
 *
 * If the data source is unavailable, returns a response indicating
 * that cached data should be used (dataStale: true).
 */
export async function handler(event: EventBridgeEvent): Promise<IngestionHandlerResponse> {
  const timestamp = new Date().toISOString();

  console.log('[IngestionHandler] Starting scheduled ingestion', {
    time: event.time,
    source: event.source,
    timestamp,
  });

  const adapter = new OpenFootballAdapter();
  const ingestionService = new IngestionService();

  try {
    const result = await ingestionService.ingestMatches(adapter);

    console.log('[IngestionHandler] Ingestion completed successfully', {
      totalFetched: result.totalFetched,
      totalStored: result.totalStored,
      skipped: result.skipped.length,
      resultsUpdated: result.resultsUpdated,
    });

    return {
      statusCode: 200,
      body: {
        success: true,
        result,
        timestamp,
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[IngestionHandler] Ingestion failed, cached data remains valid', {
      error: errorMessage,
      timestamp,
    });

    // Data source unavailability: return gracefully with stale flag
    // The previously cached data in DynamoDB remains valid and accessible
    return {
      statusCode: 200,
      body: {
        success: false,
        dataStale: true,
        error: errorMessage,
        timestamp,
      },
    };
  }
}

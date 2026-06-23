import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler, EventBridgeEvent } from './ingestion';
import { IngestionService } from '../ingestion/ingestion-service';
import { OpenFootballAdapter } from '../ingestion/open-football-adapter';

vi.mock('../ingestion/ingestion-service');
vi.mock('../ingestion/open-football-adapter');

const MockIngestionService = vi.mocked(IngestionService);

function createEvent(overrides: Partial<EventBridgeEvent> = {}): EventBridgeEvent {
  return {
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    time: '2026-06-11T12:00:00Z',
    detail: {},
    ...overrides,
  };
}

describe('Ingestion Lambda Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return successful result when ingestion completes', async () => {
    const mockResult = {
      totalFetched: 104,
      totalStored: 102,
      skipped: [{ reason: 'Missing required field: venue', rawData: {} }],
      resultsUpdated: 10,
    };

    MockIngestionService.prototype.ingestMatches = vi.fn().mockResolvedValue(mockResult);

    const response = await handler(createEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.result).toEqual(mockResult);
    expect(response.body.dataStale).toBeUndefined();
    expect(response.body.timestamp).toBeDefined();
  });

  it('should instantiate OpenFootballAdapter and IngestionService', async () => {
    MockIngestionService.prototype.ingestMatches = vi.fn().mockResolvedValue({
      totalFetched: 0,
      totalStored: 0,
      skipped: [],
      resultsUpdated: 0,
    });

    await handler(createEvent());

    expect(OpenFootballAdapter).toHaveBeenCalledTimes(1);
    expect(IngestionService).toHaveBeenCalledTimes(1);
  });

  it('should handle data source unavailability gracefully with stale flag', async () => {
    MockIngestionService.prototype.ingestMatches = vi.fn().mockRejectedValue(
      new Error('Failed to fetch match data from openfootball: 503 Service Unavailable')
    );

    const response = await handler(createEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.dataStale).toBe(true);
    expect(response.body.error).toContain('503 Service Unavailable');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should handle unknown errors gracefully', async () => {
    MockIngestionService.prototype.ingestMatches = vi.fn().mockRejectedValue('unexpected error');

    const response = await handler(createEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(false);
    expect(response.body.dataStale).toBe(true);
    expect(response.body.error).toBe('Unknown error');
  });

  it('should return IngestionResult with counts and skipped records', async () => {
    const mockResult = {
      totalFetched: 50,
      totalStored: 48,
      skipped: [
        { reason: 'Missing required field: team1', rawData: { date: '2026-06-11' } },
        { reason: 'Missing required field: date', rawData: { team1: 'Mexico' } },
      ],
      resultsUpdated: 5,
    };

    MockIngestionService.prototype.ingestMatches = vi.fn().mockResolvedValue(mockResult);

    const response = await handler(createEvent());

    expect(response.body.result?.totalFetched).toBe(50);
    expect(response.body.result?.totalStored).toBe(48);
    expect(response.body.result?.skipped).toHaveLength(2);
    expect(response.body.result?.resultsUpdated).toBe(5);
  });

  it('should include timestamp in all responses', async () => {
    MockIngestionService.prototype.ingestMatches = vi.fn().mockResolvedValue({
      totalFetched: 0,
      totalStored: 0,
      skipped: [],
      resultsUpdated: 0,
    });

    const response = await handler(createEvent());

    expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

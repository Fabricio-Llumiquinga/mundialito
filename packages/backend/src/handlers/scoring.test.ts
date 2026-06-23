import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createScoringHandler, ScoringEvent, ScoringHandlerResponse } from './scoring';
import { ScoringService, ScoringResult } from '../scoring/scoring-service';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockScoringService(overrides: Partial<ScoringService> = {}): ScoringService {
  return {
    scoreMatch: vi.fn().mockResolvedValue({
      matchId: 'match-1',
      usersScored: 0,
      pointsAwarded: [],
    } satisfies ScoringResult),
    scoreTournamentWinner: vi.fn().mockResolvedValue({
      matchId: 'TOURNAMENT_WINNER',
      usersScored: 0,
      pointsAwarded: [],
    } satisfies ScoringResult),
    ...overrides,
  } as unknown as ScoringService;
}

function createEvent(overrides: Partial<ScoringEvent> = {}): ScoringEvent {
  return {
    matchId: 'match-2026-06-11-mex-usa',
    team1Score: 2,
    team2Score: 1,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Scoring Lambda Handler', () => {
  let mockScoringService: ScoringService;
  let handler: (event: ScoringEvent) => Promise<ScoringHandlerResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScoringService = createMockScoringService();
    handler = createScoringHandler(mockScoringService);
  });

  describe('Event validation', () => {
    it('should throw when matchId is missing', async () => {
      const event = createEvent({ matchId: '' });

      await expect(handler(event)).rejects.toThrow(
        'Invalid scoring event: matchId, team1Score, and team2Score are required',
      );
    });

    it('should throw when team1Score is undefined', async () => {
      const event = { matchId: 'match-1', team2Score: 1 } as ScoringEvent;

      await expect(handler(event)).rejects.toThrow(
        'Invalid scoring event: matchId, team1Score, and team2Score are required',
      );
    });

    it('should throw when team2Score is undefined', async () => {
      const event = { matchId: 'match-1', team1Score: 2 } as ScoringEvent;

      await expect(handler(event)).rejects.toThrow(
        'Invalid scoring event: matchId, team1Score, and team2Score are required',
      );
    });

    it('should throw when team1Score is not a number', async () => {
      const event = { matchId: 'match-1', team1Score: '2' as any, team2Score: 1 } as ScoringEvent;

      await expect(handler(event)).rejects.toThrow(
        'Invalid scoring event: team1Score and team2Score must be numbers',
      );
    });

    it('should throw when team2Score is not a number', async () => {
      const event = { matchId: 'match-1', team1Score: 2, team2Score: '1' as any } as ScoringEvent;

      await expect(handler(event)).rejects.toThrow(
        'Invalid scoring event: team1Score and team2Score must be numbers',
      );
    });
  });

  describe('Successful scoring', () => {
    it('should return success with zero users when no predictions exist', async () => {
      const event = createEvent();

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.matchId).toBe('match-2026-06-11-mex-usa');
      expect(response.body.usersScored).toBe(0);
      expect(response.body.totalPointsAwarded).toBe(0);
      expect(response.body.errors).toEqual([]);
    });

    it('should call scoreMatch with correct match result', async () => {
      const event = createEvent({
        matchId: 'match-1',
        team1Score: 3,
        team2Score: 0,
      });

      await handler(event);

      expect(mockScoringService.scoreMatch).toHaveBeenCalledWith('match-1', {
        matchId: 'match-1',
        team1Score: 3,
        team2Score: 0,
        penaltyWinner: undefined,
      });
    });

    it('should pass penaltyWinner when provided', async () => {
      const event = createEvent({
        matchId: 'match-1',
        team1Score: 1,
        team2Score: 1,
        penaltyWinner: 'team2',
      });

      await handler(event);

      expect(mockScoringService.scoreMatch).toHaveBeenCalledWith('match-1', {
        matchId: 'match-1',
        team1Score: 1,
        team2Score: 1,
        penaltyWinner: 'team2',
      });
    });

    it('should return correct totals when users are scored', async () => {
      mockScoringService = createMockScoringService({
        scoreMatch: vi.fn().mockResolvedValue({
          matchId: 'match-1',
          usersScored: 3,
          pointsAwarded: [
            { userId: 'user-1', points: 8 },
            { userId: 'user-2', points: 3 },
            { userId: 'user-3', points: 0 },
          ],
        } satisfies ScoringResult),
      });
      handler = createScoringHandler(mockScoringService);

      const event = createEvent({ matchId: 'match-1' });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.usersScored).toBe(3);
      expect(response.body.totalPointsAwarded).toBe(11); // 8 + 3 + 0
      expect(response.body.errors).toEqual([]);
    });

    it('should handle match with score 0-0', async () => {
      const event = createEvent({
        matchId: 'match-1',
        team1Score: 0,
        team2Score: 0,
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockScoringService.scoreMatch).toHaveBeenCalledWith('match-1', {
        matchId: 'match-1',
        team1Score: 0,
        team2Score: 0,
        penaltyWinner: undefined,
      });
    });

    it('should include timestamp in response', async () => {
      const event = createEvent();

      const response = await handler(event);

      expect(response.body.timestamp).toBeDefined();
      // Verify it's a valid ISO timestamp
      expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    });
  });

  describe('Error handling and dead letter queue', () => {
    it('should re-throw errors from ScoringService for DLQ routing', async () => {
      const dbError = new Error('DynamoDB throttling: ProvisionedThroughputExceededException');
      mockScoringService = createMockScoringService({
        scoreMatch: vi.fn().mockRejectedValue(dbError),
      });
      handler = createScoringHandler(mockScoringService);

      const event = createEvent();

      await expect(handler(event)).rejects.toThrow(
        'DynamoDB throttling: ProvisionedThroughputExceededException',
      );
    });

    it('should re-throw unknown errors for DLQ routing', async () => {
      mockScoringService = createMockScoringService({
        scoreMatch: vi.fn().mockRejectedValue('unexpected string error'),
      });
      handler = createScoringHandler(mockScoringService);

      const event = createEvent();

      await expect(handler(event)).rejects.toBe('unexpected string error');
    });
  });

  describe('Penalty shootout scenarios', () => {
    it('should handle knockout match with penalty winner team1', async () => {
      mockScoringService = createMockScoringService({
        scoreMatch: vi.fn().mockResolvedValue({
          matchId: 'knockout-match-1',
          usersScored: 2,
          pointsAwarded: [
            { userId: 'user-1', points: 3 },
            { userId: 'user-2', points: 0 },
          ],
        } satisfies ScoringResult),
      });
      handler = createScoringHandler(mockScoringService);

      const event = createEvent({
        matchId: 'knockout-match-1',
        team1Score: 2,
        team2Score: 2,
        penaltyWinner: 'team1',
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.usersScored).toBe(2);
      expect(response.body.totalPointsAwarded).toBe(3);
    });

    it('should handle knockout match with penalty winner team2', async () => {
      mockScoringService = createMockScoringService({
        scoreMatch: vi.fn().mockResolvedValue({
          matchId: 'knockout-match-2',
          usersScored: 1,
          pointsAwarded: [{ userId: 'user-1', points: 8 }],
        } satisfies ScoringResult),
      });
      handler = createScoringHandler(mockScoringService);

      const event = createEvent({
        matchId: 'knockout-match-2',
        team1Score: 1,
        team2Score: 1,
        penaltyWinner: 'team2',
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(response.body.totalPointsAwarded).toBe(8);
    });
  });
});

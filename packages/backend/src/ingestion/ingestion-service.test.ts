import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionService, validateMatchRecord, SkippedRecord } from './ingestion-service';
import { MatchDataSource, RawMatchData } from './types';

// Mock the DynamoDB client
const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend } as any;

function createMockSource(matches: RawMatchData[]): MatchDataSource {
  return {
    fetchMatches: vi.fn().mockResolvedValue(matches),
    getName: () => 'test-source',
  };
}

function validMatch(overrides: Partial<RawMatchData> = {}): RawMatchData {
  return {
    matchId: 'm-2026-06-11-mexico-united-states',
    team1: 'Mexico',
    team2: 'United States',
    date: '2026-06-11',
    time: '21:00',
    venue: 'Estadio Azteca',
    phase: 'group_stage',
    group: 'A',
    ...overrides,
  };
}

describe('validateMatchRecord', () => {
  it('returns null for a valid record with all required fields', () => {
    const record = validMatch();
    expect(validateMatchRecord(record)).toBeNull();
  });

  it('returns error when team1 is missing', () => {
    const record = validMatch({ team1: '' });
    expect(validateMatchRecord(record)).toBe('Missing required field: team1');
  });

  it('returns error when team2 is missing', () => {
    const record = validMatch({ team2: '' });
    expect(validateMatchRecord(record)).toBe('Missing required field: team2');
  });

  it('returns error when date is missing', () => {
    const record = validMatch({ date: '' });
    expect(validateMatchRecord(record)).toBe('Missing required field: date');
  });

  it('returns error when time is missing', () => {
    const record = validMatch({ time: '' });
    expect(validateMatchRecord(record)).toBe('Missing required field: time');
  });

  it('returns error when venue is missing', () => {
    const record = validMatch({ venue: '' });
    expect(validateMatchRecord(record)).toBe('Missing required field: venue');
  });
});

describe('IngestionService', () => {
  let service: IngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngestionService(mockClient, 'TestTable');
  });

  describe('ingestMatches()', () => {
    it('stores valid matches and returns correct counts', async () => {
      const matches = [
        validMatch(),
        validMatch({
          matchId: 'm-2026-06-12-brazil-germany',
          team1: 'Brazil',
          team2: 'Germany',
          date: '2026-06-12',
          group: 'B',
        }),
      ];
      const source = createMockSource(matches);

      const result = await service.ingestMatches(source);

      expect(result.totalFetched).toBe(2);
      expect(result.totalStored).toBe(2);
      expect(result.skipped).toHaveLength(0);
      expect(result.resultsUpdated).toBe(0);
    });

    it('skips invalid records and collects reasons', async () => {
      const matches = [
        validMatch(),
        validMatch({ matchId: 'm-invalid', team1: '', team2: 'Germany', date: '2026-06-12' }),
      ];
      const source = createMockSource(matches);

      const result = await service.ingestMatches(source);

      expect(result.totalFetched).toBe(2);
      expect(result.totalStored).toBe(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('Missing required field: team1');
      expect(result.skipped[0].rawData).toEqual(matches[1]);
    });

    it('logs warnings for skipped records', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const matches = [validMatch({ matchId: 'm-bad', venue: '' })];
      const source = createMockSource(matches);

      await service.ingestMatches(source);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[IngestionService] Skipping record'),
        expect.anything()
      );
      warnSpy.mockRestore();
    });

    it('writes both MATCH# and PHASE# entries for each valid match', async () => {
      const matches = [validMatch()];
      const source = createMockSource(matches);

      await service.ingestMatches(source);

      // 2 PutCommand calls: one for MATCH# entity, one for PHASE# entity
      expect(mockSend).toHaveBeenCalledTimes(2);

      const calls = mockSend.mock.calls;
      const items = calls.map((c: any) => c[0].input.Item);

      // MATCH# entity
      const matchItem = items.find((item: any) => item.PK.startsWith('MATCH#'));
      expect(matchItem).toBeDefined();
      expect(matchItem.PK).toBe('MATCH#m-2026-06-11-mexico-united-states');
      expect(matchItem.SK).toBe('METADATA');
      expect(matchItem.team1Name).toBe('Mexico');
      expect(matchItem.team2Name).toBe('United States');
      expect(matchItem.venue).toBe('Estadio Azteca');
      expect(matchItem.phase).toBe('group_stage');
      expect(matchItem.status).toBe('upcoming');

      // PHASE# entity
      const phaseItem = items.find((item: any) => item.PK.startsWith('PHASE#'));
      expect(phaseItem).toBeDefined();
      expect(phaseItem.PK).toBe('PHASE#group_stage#GROUP#A');
      expect(phaseItem.SK).toBe('MATCH#2026-06-11#m-2026-06-11-mexico-united-states');
      expect(phaseItem.matchId).toBe('m-2026-06-11-mexico-united-states');
    });

    it('detects and stores match results when score.ft is present', async () => {
      const matches = [
        validMatch({
          score: { ft: [2, 1] },
        }),
      ];
      const source = createMockSource(matches);

      const result = await service.ingestMatches(source);

      expect(result.resultsUpdated).toBe(1);

      const calls = mockSend.mock.calls;
      const items = calls.map((c: any) => c[0].input.Item);

      const matchItem = items.find((item: any) => item.PK.startsWith('MATCH#'));
      expect(matchItem.team1Score).toBe(2);
      expect(matchItem.team2Score).toBe(1);
      expect(matchItem.status).toBe('completed');

      const phaseItem = items.find((item: any) => item.PK.startsWith('PHASE#'));
      expect(phaseItem.team1Score).toBe(2);
      expect(phaseItem.team2Score).toBe(1);
      expect(phaseItem.status).toBe('completed');
    });

    it('stores penalty winner when available', async () => {
      const matches = [
        validMatch({
          phase: 'round_of_16',
          group: undefined,
          score: { ft: [1, 1] },
          penaltyWinner: 'team2',
        }),
      ];
      const source = createMockSource(matches);

      await service.ingestMatches(source);

      const calls = mockSend.mock.calls;
      const items = calls.map((c: any) => c[0].input.Item);

      const matchItem = items.find((item: any) => item.PK.startsWith('MATCH#'));
      expect(matchItem.penaltyWinner).toBe('team2');
    });

    it('implements idempotent writes (PutItem overwrites same key)', async () => {
      const matches = [validMatch()];
      const source = createMockSource(matches);

      // Ingest twice
      await service.ingestMatches(source);
      await service.ingestMatches(source);

      // Both calls succeed (PutItem is idempotent)
      expect(mockSend).toHaveBeenCalledTimes(4); // 2 puts per ingestion × 2 ingestions
    });

    it('handles empty fetch result', async () => {
      const source = createMockSource([]);

      const result = await service.ingestMatches(source);

      expect(result.totalFetched).toBe(0);
      expect(result.totalStored).toBe(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.resultsUpdated).toBe(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('generates correct phase key without group for knockout matches', async () => {
      const matches = [
        validMatch({
          matchId: 'm-2026-07-01-brazil-argentina',
          team1: 'Brazil',
          team2: 'Argentina',
          date: '2026-07-01',
          phase: 'quarter_finals',
          group: undefined,
        }),
      ];
      const source = createMockSource(matches);

      await service.ingestMatches(source);

      const calls = mockSend.mock.calls;
      const items = calls.map((c: any) => c[0].input.Item);

      const phaseItem = items.find((item: any) => item.PK.startsWith('PHASE#'));
      expect(phaseItem.PK).toBe('PHASE#quarter_finals');
    });

    it('uses the correct table name in DynamoDB commands', async () => {
      const matches = [validMatch()];
      const source = createMockSource(matches);

      await service.ingestMatches(source);

      const calls = mockSend.mock.calls;
      for (const call of calls) {
        expect(call[0].input.TableName).toBe('TestTable');
      }
    });
  });
});

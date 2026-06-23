import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetMatches,
  computeMatchStatus,
  parseMatchDateTime,
  toMatchView,
  parsePhaseFromPK,
  APIGatewayEvent,
} from './matches';
import { PhaseIndexEntity } from '@mudialito/shared';

// Mock the DynamoDB client
vi.mock('../db/client', () => ({
  getDefaultClient: vi.fn(),
  getTableName: vi.fn(() => 'TestTable'),
}));

// Create mock DynamoDB client
function createMockClient() {
  return {
    send: vi.fn(),
  } as any;
}

function createEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path: '/matches',
    queryStringParameters: null,
    body: null,
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-123',
          email: 'test@any2cloud.com',
        },
      },
    },
    ...overrides,
  };
}

function createPhaseItem(overrides: Partial<PhaseIndexEntity> = {}): PhaseIndexEntity {
  return {
    PK: 'PHASE#group_stage#GROUP#A',
    SK: 'MATCH#2026-06-11#m-2026-06-11-mex-usa',
    matchId: 'm-2026-06-11-mex-usa',
    team1Name: 'Mexico',
    team2Name: 'USA',
    date: '2026-06-11',
    time: '18:00',
    venue: 'Estadio Azteca',
    status: 'upcoming',
    ...overrides,
  };
}

const TEST_TABLE = 'TestTable';

// Fixed "now" for deterministic tests: 2026-06-12T10:00:00Z
const FIXED_NOW = new Date('2026-06-12T10:00:00Z');
const getNow = () => FIXED_NOW;

describe('GET /matches', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it('should return all matches when no filters are applied', async () => {
    // Mock returns for all 7 phase queries
    const groupStageItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      date: '2026-06-11',
      time: '18:00',
    });

    // First query (group_stage) returns one item, rest return empty
    mockClient.send
      .mockResolvedValueOnce({ Items: [groupStageItem], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(1);
    expect(body.totalCount).toBe(1);
    expect(body.matches[0].matchId).toBe('m-2026-06-11-mex-usa');
  });

  it('should filter matches by phase', async () => {
    const items = [
      createPhaseItem({ PK: 'PHASE#round_of_32', matchId: 'm-r32-1', date: '2026-07-01' }),
      createPhaseItem({ PK: 'PHASE#round_of_32', matchId: 'm-r32-2', date: '2026-07-02' }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'round_of_32' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(2);
    expect(body.totalCount).toBe(2);

    // Verify the query used the correct PK
    const queryInput = mockClient.send.mock.calls[0][0].input;
    expect(queryInput.ExpressionAttributeValues[':pk']).toBe('PHASE#round_of_32');
  });

  it('should filter matches by phase and group', async () => {
    const items = [
      createPhaseItem({
        PK: 'PHASE#group_stage#GROUP#B',
        matchId: 'm-gs-b-1',
        date: '2026-06-12',
      }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage', group: 'B' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(1);

    // Verify the query used the group-specific PK
    const queryInput = mockClient.send.mock.calls[0][0].input;
    expect(queryInput.ExpressionAttributeValues[':pk']).toBe('PHASE#group_stage#GROUP#B');
  });

  it('should return 400 for invalid phase', async () => {
    const event = createEvent({
      queryStringParameters: { phase: 'invalid_phase' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid phase');
  });

  it('should return 400 when group is provided without phase', async () => {
    const event = createEvent({
      queryStringParameters: { group: 'A' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Group filter requires phase');
  });

  it('should return 400 when group is provided with non-group_stage phase', async () => {
    const event = createEvent({
      queryStringParameters: { phase: 'round_of_16', group: 'A' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('only valid for group_stage');
  });

  it('should return 400 for invalid group letter', async () => {
    const event = createEvent({
      queryStringParameters: { phase: 'group_stage', group: 'Z' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Invalid group');
  });

  it('should normalize group to uppercase', async () => {
    const items = [
      createPhaseItem({ PK: 'PHASE#group_stage#GROUP#A', matchId: 'm-gs-a-1' }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage', group: 'a' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(200);
    const queryInput = mockClient.send.mock.calls[0][0].input;
    expect(queryInput.ExpressionAttributeValues[':pk']).toBe('PHASE#group_stage#GROUP#A');
  });

  it('should compute match status dynamically', async () => {
    // Match in the past with no result -> in_progress
    const inProgressItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      date: '2026-06-11',
      time: '18:00',
      team1Score: undefined,
      team2Score: undefined,
    });

    // Match in the future -> upcoming
    const upcomingItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      matchId: 'm-upcoming',
      date: '2026-06-20',
      time: '20:00',
    });

    // Match with result -> completed
    const completedItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      matchId: 'm-completed',
      date: '2026-06-10',
      time: '15:00',
      team1Score: 2,
      team2Score: 1,
    });

    mockClient.send.mockResolvedValueOnce({
      Items: [completedItem, inProgressItem, upcomingItem],
      LastEvaluatedKey: undefined,
    });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(3);

    const completed = body.matches.find((m: any) => m.matchId === 'm-completed');
    const inProgress = body.matches.find((m: any) => m.matchId === 'm-2026-06-11-mex-usa');
    const upcoming = body.matches.find((m: any) => m.matchId === 'm-upcoming');

    expect(completed.status).toBe('completed');
    expect(inProgress.status).toBe('in_progress');
    expect(upcoming.status).toBe('upcoming');
  });

  it('should include result for completed matches', async () => {
    const completedItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      matchId: 'm-completed',
      date: '2026-06-10',
      time: '15:00',
      team1Score: 3,
      team2Score: 1,
    });

    mockClient.send.mockResolvedValueOnce({
      Items: [completedItem],
      LastEvaluatedKey: undefined,
    });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    const body = JSON.parse(response.body);
    expect(body.matches[0].result).toEqual({
      team1Score: 3,
      team2Score: 1,
    });
  });

  it('should not include result for upcoming matches', async () => {
    const upcomingItem = createPhaseItem({
      PK: 'PHASE#group_stage',
      date: '2026-06-20',
      time: '20:00',
    });

    mockClient.send.mockResolvedValueOnce({
      Items: [upcomingItem],
      LastEvaluatedKey: undefined,
    });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    const body = JSON.parse(response.body);
    expect(body.matches[0].result).toBeUndefined();
  });

  it('should return matches sorted chronologically when querying all phases', async () => {
    const laterMatch = createPhaseItem({
      PK: 'PHASE#group_stage',
      matchId: 'm-later',
      date: '2026-06-15',
      time: '20:00',
    });
    const earlierMatch = createPhaseItem({
      PK: 'PHASE#round_of_32',
      matchId: 'm-earlier',
      date: '2026-06-12',
      time: '14:00',
    });

    // group_stage returns later match, round_of_32 returns earlier match
    mockClient.send
      .mockResolvedValueOnce({ Items: [laterMatch], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [earlierMatch], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(2);
    // Earlier date should come first
    expect(body.matches[0].matchId).toBe('m-earlier');
    expect(body.matches[1].matchId).toBe('m-later');
  });

  it('should handle DynamoDB pagination', async () => {
    const item1 = createPhaseItem({ PK: 'PHASE#group_stage', matchId: 'm-1', date: '2026-06-11' });
    const item2 = createPhaseItem({ PK: 'PHASE#group_stage', matchId: 'm-2', date: '2026-06-12' });

    mockClient.send
      .mockResolvedValueOnce({ Items: [item1], LastEvaluatedKey: { PK: 'next' } })
      .mockResolvedValueOnce({ Items: [item2], LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    const body = JSON.parse(response.body);
    expect(body.matches).toHaveLength(2);
  });

  it('should include CORS headers in response', async () => {
    mockClient.send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'group_stage' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
  });

  it('should return empty matches array when no matches found', async () => {
    mockClient.send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent({
      queryStringParameters: { phase: 'final' },
    });
    const response = await handleGetMatches(event, mockClient, TEST_TABLE, getNow);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.matches).toEqual([]);
    expect(body.totalCount).toBe(0);
  });
});

describe('computeMatchStatus', () => {
  it('should return "completed" when scores are recorded', () => {
    const now = new Date('2026-06-12T10:00:00Z');
    const status = computeMatchStatus('2026-06-11', '18:00', 2, 1, now);
    expect(status).toBe('completed');
  });

  it('should return "completed" even if match is in the future but has scores', () => {
    // Edge case: scores recorded before match time (unlikely but should handle)
    const now = new Date('2026-06-10T10:00:00Z');
    const status = computeMatchStatus('2026-06-11', '18:00', 0, 0, now);
    expect(status).toBe('completed');
  });

  it('should return "in_progress" when match has started but no result', () => {
    const now = new Date('2026-06-11T19:00:00Z'); // 1 hour after match start
    const status = computeMatchStatus('2026-06-11', '18:00', undefined, undefined, now);
    expect(status).toBe('in_progress');
  });

  it('should return "in_progress" when current time equals match start time', () => {
    const now = new Date('2026-06-11T18:00:00Z'); // Exactly at match start
    const status = computeMatchStatus('2026-06-11', '18:00', undefined, undefined, now);
    expect(status).toBe('in_progress');
  });

  it('should return "upcoming" when match has not started', () => {
    const now = new Date('2026-06-11T17:59:59Z'); // 1 second before match start
    const status = computeMatchStatus('2026-06-11', '18:00', undefined, undefined, now);
    expect(status).toBe('upcoming');
  });

  it('should return "completed" when score is 0-0', () => {
    const now = new Date('2026-06-12T10:00:00Z');
    const status = computeMatchStatus('2026-06-11', '18:00', 0, 0, now);
    expect(status).toBe('completed');
  });
});

describe('parseMatchDateTime', () => {
  it('should parse date and time into UTC Date', () => {
    const result = parseMatchDateTime('2026-06-11', '18:00');
    expect(result.toISOString()).toBe('2026-06-11T18:00:00.000Z');
  });

  it('should handle midnight time', () => {
    const result = parseMatchDateTime('2026-07-01', '00:00');
    expect(result.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });
});

describe('toMatchView', () => {
  const now = new Date('2026-06-12T10:00:00Z');

  it('should convert PhaseIndexEntity to MatchView with upcoming status', () => {
    const item = createPhaseItem({
      PK: 'PHASE#group_stage#GROUP#A',
      date: '2026-06-20',
      time: '20:00',
    });

    const result = toMatchView(item, now);

    expect(result.matchId).toBe('m-2026-06-11-mex-usa');
    expect(result.team1.teamName).toBe('Mexico');
    expect(result.team1.teamId).toBe('mexico');
    expect(result.team2.teamName).toBe('USA');
    expect(result.team2.teamId).toBe('usa');
    expect(result.date).toBe('2026-06-20');
    expect(result.time).toBe('20:00');
    expect(result.venue).toBe('Estadio Azteca');
    expect(result.phase).toBe('group_stage');
    expect(result.group).toBe('A');
    expect(result.status).toBe('upcoming');
    expect(result.result).toBeUndefined();
  });

  it('should include result for completed matches', () => {
    const item = createPhaseItem({
      PK: 'PHASE#group_stage#GROUP#A',
      date: '2026-06-10',
      time: '15:00',
      team1Score: 2,
      team2Score: 1,
    });

    const result = toMatchView(item, now);

    expect(result.status).toBe('completed');
    expect(result.result).toEqual({
      team1Score: 2,
      team2Score: 1,
    });
  });

  it('should not include group for non-group-stage matches', () => {
    const item = createPhaseItem({
      PK: 'PHASE#round_of_16',
      date: '2026-07-05',
      time: '18:00',
    });

    const result = toMatchView(item, now);

    expect(result.phase).toBe('round_of_16');
    expect(result.group).toBeUndefined();
  });
});

describe('parsePhaseFromPK', () => {
  it('should parse simple phase PK', () => {
    expect(parsePhaseFromPK('PHASE#group_stage')).toEqual({
      phase: 'group_stage',
      group: undefined,
    });
  });

  it('should parse phase PK with group', () => {
    expect(parsePhaseFromPK('PHASE#group_stage#GROUP#A')).toEqual({
      phase: 'group_stage',
      group: 'A',
    });
  });

  it('should parse knockout phase PK', () => {
    expect(parsePhaseFromPK('PHASE#round_of_32')).toEqual({
      phase: 'round_of_32',
      group: undefined,
    });
  });

  it('should parse final phase PK', () => {
    expect(parsePhaseFromPK('PHASE#final')).toEqual({
      phase: 'final',
      group: undefined,
    });
  });
});

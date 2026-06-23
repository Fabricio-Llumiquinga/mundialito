import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleGetLeaderboard,
  computeRankedEntries,
  APIGatewayEvent,
} from './leaderboard';
import { UserScoreEntity } from '@mudialito/shared';

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
    path: '/leaderboard',
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

function createUserScore(overrides: Partial<UserScoreEntity> = {}): UserScoreEntity {
  return {
    PK: 'USER#user-1',
    SK: 'SCORE',
    GSI1PK: 'LEADERBOARD',
    GSI1SK: 'SCORE#99957#99994#Alice',
    userId: 'user-1',
    displayName: 'Alice',
    totalScore: 42,
    exactScoreCount: 5,
    matchWinnerCorrect: 10,
    tournamentWinnerCorrect: false,
    lastUpdated: '2026-06-15T00:00:00Z',
    ...overrides,
  };
}

const TEST_TABLE = 'TestTable';

describe('GET /leaderboard', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = createEvent({
      requestContext: { authorizer: undefined },
    });

    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('Authentication required');
  });

  it('should return empty leaderboard when no users have scores', async () => {
    mockClient.send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.entries).toEqual([]);
    expect(body.currentUserRank).toBe(0);
  });

  it('should return ranked leaderboard entries sorted by score descending', async () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 42, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 30, exactScoreCount: 3 }),
      createUserScore({ userId: 'user-123', displayName: 'Charlie', totalScore: 20, exactScoreCount: 2 }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.entries).toHaveLength(3);
    expect(body.entries[0].rank).toBe(1);
    expect(body.entries[0].displayName).toBe('Alice');
    expect(body.entries[0].totalScore).toBe(42);
    expect(body.entries[1].rank).toBe(2);
    expect(body.entries[1].displayName).toBe('Bob');
    expect(body.entries[2].rank).toBe(3);
    expect(body.entries[2].displayName).toBe('Charlie');
    expect(body.entries[2].isCurrentUser).toBe(true);
    expect(body.currentUserRank).toBe(3);
  });

  it('should mark current user entry with isCurrentUser: true', async () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-123', displayName: 'Me', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Other', totalScore: 30, exactScoreCount: 2 }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    const body = JSON.parse(response.body);
    expect(body.entries[0].isCurrentUser).toBe(true);
    expect(body.entries[1].isCurrentUser).toBe(false);
    expect(body.currentUserRank).toBe(1);
  });

  it('should handle pagination from DynamoDB', async () => {
    const firstPage: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 5 }),
    ];
    const secondPage: UserScoreEntity[] = [
      createUserScore({ userId: 'user-123', displayName: 'Bob', totalScore: 30, exactScoreCount: 3 }),
    ];

    mockClient.send
      .mockResolvedValueOnce({ Items: firstPage, LastEvaluatedKey: { PK: 'next' } })
      .mockResolvedValueOnce({ Items: secondPage, LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    const body = JSON.parse(response.body);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].displayName).toBe('Alice');
    expect(body.entries[1].displayName).toBe('Bob');
    expect(body.currentUserRank).toBe(2);
  });

  it('should include CORS headers in response', async () => {
    mockClient.send.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
  });

  it('should return currentUserRank 0 when current user is not in leaderboard', async () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-other', displayName: 'Other', totalScore: 50, exactScoreCount: 5 }),
    ];

    mockClient.send.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const event = createEvent();
    const response = await handleGetLeaderboard(event, mockClient, TEST_TABLE);

    const body = JSON.parse(response.body);
    expect(body.currentUserRank).toBe(0);
  });
});

describe('computeRankedEntries', () => {
  it('should return empty array for empty input', () => {
    const result = computeRankedEntries([], 'user-1');
    expect(result).toEqual([]);
  });

  it('should assign sequential ranks for distinct scores', () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 40, exactScoreCount: 4 }),
      createUserScore({ userId: 'user-3', displayName: 'Charlie', totalScore: 30, exactScoreCount: 3 }),
    ];

    const result = computeRankedEntries(items, 'user-1');

    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
    expect(result[2].rank).toBe(3);
  });

  it('should assign same rank for tied users (same score + same exact count)', () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-3', displayName: 'Charlie', totalScore: 30, exactScoreCount: 3 }),
    ];

    const result = computeRankedEntries(items, 'user-1');

    expect(result[0].rank).toBe(1);
    expect(result[0].displayName).toBe('Alice');
    expect(result[1].rank).toBe(1);
    expect(result[1].displayName).toBe('Bob');
    expect(result[2].rank).toBe(3); // Rank 3, not 2 (skips rank 2)
  });

  it('should use exact score count as tiebreaker (higher exact count ranks first)', () => {
    // Items come pre-sorted from DynamoDB: same score, higher exact count first
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 7 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 50, exactScoreCount: 3 }),
      createUserScore({ userId: 'user-3', displayName: 'Charlie', totalScore: 30, exactScoreCount: 2 }),
    ];

    const result = computeRankedEntries(items, 'user-1');

    // Different exact counts means different ranks even with same total score
    expect(result[0].rank).toBe(1);
    expect(result[0].displayName).toBe('Alice');
    expect(result[0].exactScoreCount).toBe(7);
    expect(result[1].rank).toBe(2);
    expect(result[1].displayName).toBe('Bob');
    expect(result[1].exactScoreCount).toBe(3);
    expect(result[2].rank).toBe(3);
  });

  it('should handle multiple tied groups correctly', () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-3', displayName: 'Charlie', totalScore: 40, exactScoreCount: 4 }),
      createUserScore({ userId: 'user-4', displayName: 'Dave', totalScore: 40, exactScoreCount: 4 }),
      createUserScore({ userId: 'user-5', displayName: 'Eve', totalScore: 30, exactScoreCount: 3 }),
    ];

    const result = computeRankedEntries(items, 'user-3');

    expect(result[0].rank).toBe(1); // Alice
    expect(result[1].rank).toBe(1); // Bob (tied with Alice)
    expect(result[2].rank).toBe(3); // Charlie (skips rank 2)
    expect(result[3].rank).toBe(3); // Dave (tied with Charlie)
    expect(result[4].rank).toBe(5); // Eve (skips rank 4)
  });

  it('should mark the current user correctly', () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 50, exactScoreCount: 5 }),
      createUserScore({ userId: 'user-2', displayName: 'Bob', totalScore: 40, exactScoreCount: 4 }),
    ];

    const result = computeRankedEntries(items, 'user-2');

    expect(result[0].isCurrentUser).toBe(false);
    expect(result[1].isCurrentUser).toBe(true);
  });

  it('should include all required fields in each entry', () => {
    const items: UserScoreEntity[] = [
      createUserScore({
        userId: 'user-1',
        displayName: 'Alice',
        totalScore: 42,
        exactScoreCount: 5,
      }),
    ];

    const result = computeRankedEntries(items, 'user-1');

    expect(result[0]).toEqual({
      rank: 1,
      userId: 'user-1',
      displayName: 'Alice',
      totalScore: 42,
      exactScoreCount: 5,
      isCurrentUser: true,
    });
  });

  it('should handle single user leaderboard', () => {
    const items: UserScoreEntity[] = [
      createUserScore({ userId: 'user-1', displayName: 'Alice', totalScore: 10, exactScoreCount: 1 }),
    ];

    const result = computeRankedEntries(items, 'user-1');

    expect(result).toHaveLength(1);
    expect(result[0].rank).toBe(1);
    expect(result[0].isCurrentUser).toBe(true);
  });
});

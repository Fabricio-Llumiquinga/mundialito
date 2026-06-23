import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleMatchWinner,
  handleFinalScore,
  handleTournamentWinner,
  handleGetMyPredictions,
  APIGatewayEvent,
} from './predictions';
import { PredictionValidator } from '../predictions/prediction-validator';

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

// Create a mock PredictionValidator
function createMockValidator(overrides: Partial<Record<string, any>> = {}) {
  return {
    validateMatchWinner: vi.fn().mockReturnValue({ valid: true }),
    validateFinalScore: vi.fn().mockReturnValue({ valid: true }),
    validateTournamentWinner: vi.fn().mockResolvedValue({ valid: true }),
    isMatchOpen: vi.fn().mockResolvedValue(true),
    isTournamentWinnerOpen: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as PredictionValidator;
}

function createEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'POST',
    path: '/predictions/match-winner',
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

const TEST_TABLE = 'TestTable';

describe('POST /predictions/match-winner', () => {
  let mockClient: any;
  let mockValidator: PredictionValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockValidator = createMockValidator();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = createEvent({
      requestContext: { authorizer: undefined },
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('Authentication required');
  });

  it('should return 400 when body is missing', async () => {
    const event = createEvent({ body: null });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Invalid request body');
  });

  it('should return 400 when matchId is missing', async () => {
    const event = createEvent({
      body: JSON.stringify({ outcome: 'team1' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('matchId and outcome are required');
  });

  it('should return 404 when match is not found and not open', async () => {
    mockValidator = createMockValidator({
      isMatchOpen: vi.fn().mockResolvedValue(false),
    });
    mockClient.send.mockResolvedValue({ Item: undefined });

    const event = createEvent({
      body: JSON.stringify({ matchId: 'nonexistent', outcome: 'team1' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Match not found');
  });

  it('should return 409 when match predictions are closed', async () => {
    mockValidator = createMockValidator({
      isMatchOpen: vi.fn().mockResolvedValue(false),
    });
    mockClient.send.mockResolvedValue({
      Item: { matchId: 'match-1', status: 'in_progress', phase: 'group_stage' },
    });

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', outcome: 'team1' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('Predictions are closed for this match');
  });

  it('should return 400 when outcome is invalid for knockout match', async () => {
    mockValidator = createMockValidator({
      validateMatchWinner: vi.fn().mockReturnValue({
        valid: false,
        error: 'Draw is not a valid outcome for knockout matches',
      }),
    });
    mockClient.send.mockResolvedValue({
      Item: { matchId: 'match-1', status: 'upcoming', phase: 'round_of_16' },
    });

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', outcome: 'draw' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Draw is not a valid outcome for knockout matches');
  });

  it('should save prediction successfully and return confirmation', async () => {
    // Mock: isMatchOpen returns true, getMatch returns a valid match, no existing prediction
    mockClient.send
      .mockResolvedValueOnce({ Item: { matchId: 'match-1', status: 'upcoming', phase: 'group_stage' } }) // getMatch
      .mockResolvedValueOnce({ Item: undefined }) // check existing prediction
      .mockResolvedValueOnce({}) // PutCommand for USER# entry
      .mockResolvedValueOnce({}); // PutCommand for MATCH_PREDS# entry

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', outcome: 'team1' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Match winner prediction saved successfully');
    expect(body.prediction.matchId).toBe('match-1');
    expect(body.prediction.outcome).toBe('team1');
    expect(body.prediction.predictionType).toBe('match_winner');
  });

  it('should preserve createdAt on upsert', async () => {
    const existingCreatedAt = '2026-01-01T00:00:00.000Z';
    mockClient.send
      .mockResolvedValueOnce({ Item: { matchId: 'match-1', status: 'upcoming', phase: 'group_stage' } }) // getMatch
      .mockResolvedValueOnce({ Item: { createdAt: existingCreatedAt, PK: 'USER#user-123', SK: 'PRED#MATCH#match-1' } }) // existing prediction
      .mockResolvedValueOnce({}) // PutCommand for USER# entry
      .mockResolvedValueOnce({}); // PutCommand for MATCH_PREDS# entry

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', outcome: 'team2' }),
    });

    const response = await handleMatchWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(200);
    // Verify the PutCommand was called with preserved createdAt
    const putCall = mockClient.send.mock.calls[2][0];
    expect(putCall.input.Item.createdAt).toBe(existingCreatedAt);
  });
});

describe('POST /predictions/final-score', () => {
  let mockClient: any;
  let mockValidator: PredictionValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockValidator = createMockValidator();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = createEvent({
      requestContext: { authorizer: undefined },
    });

    const response = await handleFinalScore(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 when scores are missing', async () => {
    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1' }),
    });

    const response = await handleFinalScore(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('matchId, team1Score, and team2Score are required');
  });

  it('should return 400 when score values are invalid', async () => {
    mockValidator = createMockValidator({
      validateFinalScore: vi.fn().mockReturnValue({
        valid: false,
        error: 'Goal values must be integers between 0 and 99',
      }),
    });

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', team1Score: -1, team2Score: 3 }),
    });

    const response = await handleFinalScore(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Goal values must be integers between 0 and 99');
  });

  it('should return 409 when match predictions are closed', async () => {
    mockValidator = createMockValidator({
      isMatchOpen: vi.fn().mockResolvedValue(false),
    });
    mockClient.send.mockResolvedValue({
      Item: { matchId: 'match-1', status: 'completed', phase: 'group_stage' },
    });

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', team1Score: 2, team2Score: 1 }),
    });

    const response = await handleFinalScore(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('Predictions are closed for this match');
  });

  it('should save final score prediction successfully', async () => {
    mockClient.send
      .mockResolvedValueOnce({ Item: undefined }) // check existing prediction
      .mockResolvedValueOnce({}) // PutCommand for USER# entry
      .mockResolvedValueOnce({}); // PutCommand for MATCH_PREDS# entry

    const event = createEvent({
      body: JSON.stringify({ matchId: 'match-1', team1Score: 2, team2Score: 1 }),
    });

    const response = await handleFinalScore(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Final score prediction saved successfully');
    expect(body.prediction.matchId).toBe('match-1');
    expect(body.prediction.team1Score).toBe(2);
    expect(body.prediction.team2Score).toBe(1);
    expect(body.prediction.predictionType).toBe('final_score');
  });
});

describe('POST /predictions/tournament-winner', () => {
  let mockClient: any;
  let mockValidator: PredictionValidator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockValidator = createMockValidator();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = createEvent({
      requestContext: { authorizer: undefined },
    });

    const response = await handleTournamentWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(401);
  });

  it('should return 400 when teamId is missing', async () => {
    const event = createEvent({
      body: JSON.stringify({}),
    });

    const response = await handleTournamentWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('teamId is required');
  });

  it('should return 409 when tournament winner predictions are closed', async () => {
    mockValidator = createMockValidator({
      isTournamentWinnerOpen: vi.fn().mockResolvedValue(false),
    });

    const event = createEvent({
      body: JSON.stringify({ teamId: 'brazil' }),
    });

    const response = await handleTournamentWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('Tournament winner predictions are closed');
  });

  it('should return 400 when team is not a participating team', async () => {
    mockValidator = createMockValidator({
      validateTournamentWinner: vi.fn().mockResolvedValue({
        valid: false,
        error: 'Selected team is not a participating team',
      }),
    });

    const event = createEvent({
      body: JSON.stringify({ teamId: 'invalid-team' }),
    });

    const response = await handleTournamentWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Selected team is not a participating team');
  });

  it('should save tournament winner prediction successfully', async () => {
    mockClient.send
      .mockResolvedValueOnce({ Item: { teamName: 'Brazil' } }) // getTeamName
      .mockResolvedValueOnce({ Item: undefined }) // check existing prediction
      .mockResolvedValueOnce({}); // PutCommand

    const event = createEvent({
      body: JSON.stringify({ teamId: 'brazil' }),
    });

    const response = await handleTournamentWinner(event, mockClient, TEST_TABLE, mockValidator);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Tournament winner prediction saved successfully');
    expect(body.prediction.teamId).toBe('brazil');
    expect(body.prediction.teamName).toBe('Brazil');
    expect(body.prediction.predictionType).toBe('tournament_winner');
  });
});

describe('GET /predictions/me', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  it('should return 401 when user is not authenticated', async () => {
    const event = createEvent({
      httpMethod: 'GET',
      path: '/predictions/me',
      requestContext: { authorizer: undefined },
    });

    const response = await handleGetMyPredictions(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(401);
  });

  it('should return empty predictions when user has none', async () => {
    mockClient.send
      .mockResolvedValueOnce({ Items: [] }) // QueryCommand for predictions
      .mockResolvedValueOnce({ Item: undefined }); // GetCommand for score

    const event = createEvent({
      httpMethod: 'GET',
      path: '/predictions/me',
    });

    const response = await handleGetMyPredictions(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.predictions).toEqual([]);
    expect(body.totalScore).toBe(0);
    expect(body.leaderboardRank).toBe(0);
  });

  it('should return all user predictions with score', async () => {
    const predictions = [
      {
        PK: 'USER#user-123',
        SK: 'PRED#MATCH#match-1',
        userId: 'user-123',
        matchId: 'match-1',
        predictionType: 'match_winner',
        outcome: 'team1',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      },
      {
        PK: 'USER#user-123',
        SK: 'PRED#TOURNAMENT_WINNER',
        userId: 'user-123',
        predictionType: 'tournament_winner',
        teamId: 'brazil',
        teamName: 'Brazil',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-01T00:00:00Z',
      },
    ];

    mockClient.send
      .mockResolvedValueOnce({ Items: predictions }) // QueryCommand for predictions
      .mockResolvedValueOnce({ Item: { totalScore: 15 } }); // GetCommand for score

    const event = createEvent({
      httpMethod: 'GET',
      path: '/predictions/me',
    });

    const response = await handleGetMyPredictions(event, mockClient, TEST_TABLE);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.predictions).toHaveLength(2);
    expect(body.predictions[0].matchId).toBe('match-1');
    expect(body.predictions[0].outcome).toBe('team1');
    expect(body.predictions[1].teamId).toBe('brazil');
    expect(body.predictions[1].teamName).toBe('Brazil');
    expect(body.totalScore).toBe(15);
  });

  it('should include CORS headers in response', async () => {
    mockClient.send
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Item: undefined });

    const event = createEvent({
      httpMethod: 'GET',
      path: '/predictions/me',
    });

    const response = await handleGetMyPredictions(event, mockClient, TEST_TABLE);

    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});

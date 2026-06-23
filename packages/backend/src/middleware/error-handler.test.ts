import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  withErrorHandler,
  sanitizeErrorMessage,
  containsSensitiveInfo,
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  APIGatewayEvent,
  APIGatewayResponse,
  LambdaHandler,
} from './error-handler';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createEvent(overrides: Partial<APIGatewayEvent> = {}): APIGatewayEvent {
  return {
    httpMethod: 'GET',
    path: '/test',
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

function createSuccessHandler(): LambdaHandler {
  return async () => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'success' }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should pass through successful responses unchanged', async () => {
    const handler = createSuccessHandler();
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ message: 'success' });
  });

  it('should return 500 with generic message for unknown errors', async () => {
    const handler: LambdaHandler = async () => {
      throw new Error('Something unexpected happened');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('An internal error occurred. Please try again later.');
    expect(body.error).not.toContain('Something unexpected');
  });

  it('should return 400 for ValidationError', async () => {
    const handler: LambdaHandler = async () => {
      throw new ValidationError('Invalid input provided');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toBe('Invalid input provided');
  });

  it('should return 401 for AuthenticationError', async () => {
    const handler: LambdaHandler = async () => {
      throw new AuthenticationError();
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe('Authentication required');
  });

  it('should return 403 for ForbiddenError', async () => {
    const handler: LambdaHandler = async () => {
      throw new ForbiddenError('Only Any2Cloud employees can access the Portal');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe('Only Any2Cloud employees can access the Portal');
  });

  it('should return 404 for NotFoundError', async () => {
    const handler: LambdaHandler = async () => {
      throw new NotFoundError('Match not found');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toBe('Match not found');
  });

  it('should return 409 for ConflictError', async () => {
    const handler: LambdaHandler = async () => {
      throw new ConflictError('Predictions are closed for this match');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toBe('Predictions are closed for this match');
  });

  it('should return custom status code for AppError', async () => {
    const handler: LambdaHandler = async () => {
      throw new AppError(422, 'Unprocessable entity');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(422);
    expect(JSON.parse(response.body).error).toBe('Unprocessable entity');
  });

  it('should log full error details to console (CloudWatch)', async () => {
    const consoleSpy = vi.spyOn(console, 'error');
    const handler: LambdaHandler = async () => {
      throw new Error('Database connection failed at /var/task/src/db/client.ts:42');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent({ path: '/predictions/me', httpMethod: 'GET' });

    await wrapped(event);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorHandler] Unhandled error:',
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'Error',
          message: 'Database connection failed at /var/task/src/db/client.ts:42',
        }),
        requestPath: '/predictions/me',
        httpMethod: 'GET',
      }),
    );
  });

  it('should not expose stack traces in error responses', async () => {
    const handler: LambdaHandler = async () => {
      const err = new Error('fail');
      err.stack = 'Error: fail\n    at Object.<anonymous> (/var/task/src/handlers/predictions.ts:42:15)';
      throw err;
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).not.toContain('/var/task');
    expect(body.error).not.toContain('predictions.ts');
    expect(body.error).not.toContain('at Object');
  });

  it('should handle non-Error thrown values', async () => {
    const handler: LambdaHandler = async () => {
      throw 'string error';
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toBe('An internal error occurred. Please try again later.');
  });

  it('should include CORS headers in error responses', async () => {
    const handler: LambdaHandler = async () => {
      throw new Error('fail');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.headers['Content-Type']).toBe('application/json');
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
  });

  it('should sanitize AppError messages that contain sensitive info', async () => {
    const handler: LambdaHandler = async () => {
      throw new AppError(400, 'Error in /var/task/src/db/client.ts while querying');
    };
    const wrapped = withErrorHandler(handler);
    const event = createEvent();

    const response = await wrapped(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('An internal error occurred. Please try again later.');
    expect(body.error).not.toContain('/var/task');
  });
});

describe('sanitizeErrorMessage', () => {
  it('should pass through safe messages unchanged', () => {
    expect(sanitizeErrorMessage('Match not found')).toBe('Match not found');
    expect(sanitizeErrorMessage('Predictions are closed for this match')).toBe('Predictions are closed for this match');
    expect(sanitizeErrorMessage('Authentication required')).toBe('Authentication required');
  });

  it('should replace messages containing file paths', () => {
    expect(sanitizeErrorMessage('Error in /src/handlers/predictions.ts')).toBe(
      'An internal error occurred. Please try again later.',
    );
  });

  it('should replace messages containing stack traces', () => {
    expect(sanitizeErrorMessage('at Object.<anonymous> (/var/task/index.js:1:1)')).toBe(
      'An internal error occurred. Please try again later.',
    );
  });

  it('should replace messages containing AWS ARNs', () => {
    expect(sanitizeErrorMessage('Error accessing arn:aws:dynamodb:us-east-1:123456789012:table/MyTable')).toBe(
      'An internal error occurred. Please try again later.',
    );
  });

  it('should replace messages containing DynamoDB query expressions', () => {
    expect(sanitizeErrorMessage('Failed: KeyConditionExpression = PK = :pk')).toBe(
      'An internal error occurred. Please try again later.',
    );
  });
});

describe('containsSensitiveInfo', () => {
  it('should detect file paths', () => {
    expect(containsSensitiveInfo('/var/task/src/handler.ts')).toBe(true);
    expect(containsSensitiveInfo('C:\\Users\\dev\\project\\index.js')).toBe(true);
  });

  it('should detect stack traces', () => {
    expect(containsSensitiveInfo('at Module._compile (/usr/lib/node.js:1:1)')).toBe(true);
  });

  it('should detect AWS ARNs', () => {
    expect(containsSensitiveInfo('arn:aws:lambda:us-east-1:123456789012:function:my-fn')).toBe(true);
  });

  it('should detect DynamoDB expressions', () => {
    expect(containsSensitiveInfo('ExpressionAttributeValues: { ":pk": "USER#123" }')).toBe(true);
  });

  it('should not flag safe user-facing messages', () => {
    expect(containsSensitiveInfo('Match not found')).toBe(false);
    expect(containsSensitiveInfo('Predictions are closed for this match')).toBe(false);
    expect(containsSensitiveInfo('Goal values must be integers between 0 and 99')).toBe(false);
    expect(containsSensitiveInfo('Draw is not a valid outcome for knockout matches')).toBe(false);
    expect(containsSensitiveInfo('Only Any2Cloud employees can access the Portal')).toBe(false);
  });
});

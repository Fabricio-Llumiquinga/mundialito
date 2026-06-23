/**
 * Global error handler middleware for Lambda functions.
 *
 * Wraps Lambda handlers to catch all unhandled exceptions and return
 * sanitized error responses. Strips stack traces, internal file paths,
 * database queries, and infrastructure identifiers from client responses.
 * Full error details are logged to CloudWatch for debugging.
 *
 * Requirements: 10.3
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * API Gateway proxy event (simplified for Lambda handler).
 */
export interface APIGatewayEvent {
  httpMethod: string;
  path: string;
  body: string | null;
  requestContext: {
    authorizer?: {
      claims?: {
        sub: string;
        email?: string;
        'cognito:username'?: string;
      };
    };
  };
  queryStringParameters?: Record<string, string> | null;
}

/**
 * API Gateway proxy response.
 */
export interface APIGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Lambda handler function type.
 */
export type LambdaHandler = (event: APIGatewayEvent) => Promise<APIGatewayResponse>;

// ─── Known Error Types ───────────────────────────────────────────────────────

/**
 * Application error with a known HTTP status code.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, message);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(409, message);
    this.name = 'ConflictError';
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const GENERIC_ERROR_MESSAGE = 'An internal error occurred. Please try again later.';

/**
 * Patterns that indicate sensitive information that must be stripped from responses.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  // Stack traces
  /at\s+\S+\s+\(.*:\d+:\d+\)/,
  /^\s+at\s+/m,
  // File paths (Unix and Windows)
  /\/[a-zA-Z0-9_\-./]+\.(ts|js|json|mjs|cjs)/,
  /[A-Z]:\\[a-zA-Z0-9_\-\\]+\.(ts|js|json|mjs|cjs)/,
  // DynamoDB table names and ARNs
  /arn:aws:[a-z0-9\-]+:[a-z0-9\-]*:\d{12}:/,
  /TableName[:\s]*["']?[a-zA-Z0-9_\-]+["']?/i,
  // AWS resource identifiers
  /[a-z]+-[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/,
  // SQL/DynamoDB query expressions
  /KeyConditionExpression|FilterExpression|ProjectionExpression|ExpressionAttributeValues/i,
  // Lambda function names
  /function[:\s]*["']?[a-zA-Z0-9_\-]+["']?/i,
  // AWS account IDs
  /\d{12}/,
];

// ─── Middleware ──────────────────────────────────────────────────────────────

/**
 * Wraps a Lambda handler with global error handling.
 *
 * - Catches all unhandled exceptions
 * - Maps known error types (AppError subclasses) to appropriate HTTP status codes
 * - Returns 500 with a generic message for unknown errors
 * - Logs full error details to CloudWatch (console.error)
 * - Strips sensitive information from error responses
 */
export function withErrorHandler(handler: LambdaHandler): LambdaHandler {
  return async (event: APIGatewayEvent): Promise<APIGatewayResponse> => {
    try {
      return await handler(event);
    } catch (error: unknown) {
      // Log full error details to CloudWatch for debugging
      console.error('[ErrorHandler] Unhandled error:', {
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        } : error,
        requestPath: event.path,
        httpMethod: event.httpMethod,
      });

      // Map known error types to HTTP status codes
      if (error instanceof AppError) {
        const sanitizedMessage = sanitizeErrorMessage(error.message);
        return createErrorResponse(error.statusCode, sanitizedMessage);
      }

      // Unknown errors get a generic 500 response
      return createErrorResponse(500, GENERIC_ERROR_MESSAGE);
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize an error message by removing any sensitive information.
 * If the message contains sensitive patterns, replace it with a generic message.
 */
export function sanitizeErrorMessage(message: string): string {
  if (containsSensitiveInfo(message)) {
    return GENERIC_ERROR_MESSAGE;
  }
  return message;
}

/**
 * Check if a string contains sensitive information that should not be exposed.
 */
export function containsSensitiveInfo(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Create a standardized error response.
 */
function createErrorResponse(statusCode: number, message: string): APIGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: message }),
  };
}

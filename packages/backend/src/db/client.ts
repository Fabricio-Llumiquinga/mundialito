/**
 * DynamoDB DocumentClient wrapper with retry configuration.
 *
 * Provides a pre-configured DynamoDB Document client with:
 * - Exponential backoff with jitter (3 retries)
 * - Configurable table name via environment variable
 * - Singleton pattern for Lambda cold start optimization
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TABLE_NAME } from './table-schema';

/** Maximum number of retry attempts for DynamoDB operations */
const MAX_RETRIES = 3;

/** Base delay in milliseconds for exponential backoff */
const BASE_DELAY_MS = 100;

/** Maximum delay in milliseconds for exponential backoff */
const MAX_DELAY_MS = 5000;

/**
 * Configuration options for the DynamoDB client.
 */
export interface DynamoDBClientConfig {
  /** AWS region (defaults to AWS_REGION env var or 'us-east-1') */
  region?: string;
  /** DynamoDB endpoint override (useful for local development) */
  endpoint?: string;
  /** Maximum number of retries (defaults to 3) */
  maxRetries?: number;
}

/**
 * Create a configured DynamoDB Document client with retry logic.
 *
 * Uses exponential backoff with full jitter for retries:
 * - Retry 1: 0-100ms
 * - Retry 2: 0-200ms
 * - Retry 3: 0-400ms
 */
export function createDynamoDBClient(config?: DynamoDBClientConfig): DynamoDBDocumentClient {
  const region = config?.region ?? process.env.AWS_REGION ?? 'us-east-1';
  const maxRetries = config?.maxRetries ?? MAX_RETRIES;

  const clientConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
    region,
    retryMode: 'adaptive',
    maxAttempts: maxRetries + 1, // maxAttempts includes the initial attempt
  };

  if (config?.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  const baseClient = new DynamoDBClient(clientConfig);

  const docClient = DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
    },
    unmarshallOptions: {
      wrapNumbers: false,
    },
  });

  return docClient;
}

/**
 * Calculate exponential backoff delay with full jitter.
 *
 * Formula: random(0, min(maxDelay, baseDelay * 2^attempt))
 *
 * @param attempt - The retry attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number = BASE_DELAY_MS,
  maxDelay: number = MAX_DELAY_MS,
): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(maxDelay, exponentialDelay);
  // Full jitter: random value between 0 and the capped delay
  return Math.floor(Math.random() * cappedDelay);
}

// --- Singleton Client ---

let _defaultClient: DynamoDBDocumentClient | null = null;

/**
 * Get the default DynamoDB Document client (singleton).
 * Reuses the same client instance across Lambda invocations for connection pooling.
 */
export function getDefaultClient(): DynamoDBDocumentClient {
  if (!_defaultClient) {
    _defaultClient = createDynamoDBClient();
  }
  return _defaultClient;
}

/**
 * Reset the default client (useful for testing).
 */
export function resetDefaultClient(): void {
  _defaultClient = null;
}

/**
 * Get the configured table name.
 */
export function getTableName(): string {
  return TABLE_NAME;
}

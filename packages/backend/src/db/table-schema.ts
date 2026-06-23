/**
 * DynamoDB single-table schema definition for the MundialPredictions table.
 *
 * Table: MundialPredictions
 * - Primary Key: PK (Partition Key) + SK (Sort Key)
 * - GSI1 (Leaderboard Index): GSI1PK (Partition Key) + GSI1SK (Sort Key)
 *
 * Access Patterns:
 * - Get match by ID:              PK=MATCH#{matchId}, SK=METADATA
 * - List matches by phase:        PK=PHASE#{phase}, SK=MATCH#{date}#{matchId}
 * - Get user prediction:          PK=USER#{userId}, SK=PRED#MATCH#{matchId}
 * - Get all user predictions:     PK=USER#{userId}, SK begins_with PRED#
 * - Get tournament winner pred:   PK=USER#{userId}, SK=PRED#TOURNAMENT_WINNER
 * - Get user score:               PK=USER#{userId}, SK=SCORE
 * - Leaderboard (ranked):         GSI1PK=LEADERBOARD, GSI1SK=SCORE#{invertedScore}#{invertedExactCount}#{displayName}
 * - Predictions for match:        PK=MATCH_PREDS#{matchId}, SK=USER#{userId}
 */

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'MundialPredictions';

export const TABLE_SCHEMA = {
  TableName: TABLE_NAME,
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' as const },
    { AttributeName: 'SK', KeyType: 'RANGE' as const },
  ],
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' as const },
    { AttributeName: 'SK', AttributeType: 'S' as const },
    { AttributeName: 'GSI1PK', AttributeType: 'S' as const },
    { AttributeName: 'GSI1SK', AttributeType: 'S' as const },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' as const },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' as const },
      ],
      Projection: { ProjectionType: 'ALL' as const },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST' as const,
} as const;

/** GSI1 index name constant */
export const GSI1_INDEX_NAME = 'GSI1';

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface MundialPredictionsStackProps extends cdk.StackProps {
  /**
   * DynamoDB table name. Defaults to 'MundialPredictions'.
   */
  tableName?: string;

  /**
   * Custom domain name for CloudFront distribution (optional).
   */
  domainName?: string;

  /**
   * ARN of an existing ACM certificate for HTTPS (optional).
   * If not provided, CloudFront will use the default certificate.
   */
  certificateArn?: string;

  /**
   * Allowed email domain for Cognito sign-up. Defaults to '@any2cloud.com'.
   */
  allowedEmailDomain?: string;

  /**
   * Microsoft Entra ID (Azure AD) configuration for federated login.
   */
  microsoftClientId?: string;
  microsoftClientSecret?: string;
  microsoftTenantId?: string;

  /**
   * Cognito domain prefix for hosted UI (must be globally unique).
   */
  cognitoDomainPrefix?: string;

  /**
   * Frontend callback URL after OAuth login.
   */
  callbackUrl?: string;
}

export class MundialPredictionsStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly api: apigateway.RestApi;
  public readonly spaBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props?: MundialPredictionsStackProps) {
    super(scope, id, props);

    const tableName = props?.tableName ?? 'MundialPredictions';
    const allowedEmailDomain = props?.allowedEmailDomain ?? '@any2cloud.com';

    // ─────────────────────────────────────────────────────────────────────────
    // DynamoDB Table
    // ─────────────────────────────────────────────────────────────────────────
    this.table = new dynamodb.Table(this, 'MundialPredictionsTable', {
      tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SQS Dead Letter Queue (for scoring Lambda failures)
    // ─────────────────────────────────────────────────────────────────────────
    this.deadLetterQueue = new sqs.Queue(this, 'ScoringDeadLetterQueue', {
      queueName: 'mundial-scoring-dlq',
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Lambda Functions
    // ─────────────────────────────────────────────────────────────────────────
    const sharedRuntime = lambda.Runtime.NODEJS_20_X;
    const sharedEnvironment: Record<string, string> = {
      DYNAMODB_TABLE_NAME: tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Pre-Sign-Up Lambda (Cognito trigger)
    const preSignUpFn = new lambda.Function(this, 'PreSignUpFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      functionName: 'mundial-pre-sign-up',
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/dist/auth'),
      description: 'Cognito Pre-Sign-Up trigger for email domain validation',
      environment: {
        ...sharedEnvironment,
        ALLOWED_EMAIL_DOMAIN: allowedEmailDomain,
      },
    });

    // Matches Lambda
    const matchesFn = new lambda.Function(this, 'MatchesFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: sharedEnvironment,
      functionName: 'mundial-matches',
      handler: 'lambda-entries/matches-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Handles GET /matches requests',
    });

    // Predictions Lambda
    const predictionsFn = new lambda.Function(this, 'PredictionsFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: sharedEnvironment,
      functionName: 'mundial-predictions',
      handler: 'lambda-entries/predictions-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Handles predictions CRUD operations',
    });

    // Scoring Lambda (with DLQ)
    const scoringFn = new lambda.Function(this, 'ScoringFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      environment: sharedEnvironment,
      functionName: 'mundial-scoring',
      handler: 'lambda-entries/scoring-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Calculates scores when match results are confirmed',
      deadLetterQueue: this.deadLetterQueue,
      deadLetterQueueEnabled: true,
      retryAttempts: 2,
    });

    // Leaderboard Lambda
    const leaderboardFn = new lambda.Function(this, 'LeaderboardFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: sharedEnvironment,
      functionName: 'mundial-leaderboard',
      handler: 'lambda-entries/leaderboard-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Handles GET /leaderboard requests',
    });

    // Ingestion Lambda
    const ingestionFn = new lambda.Function(this, 'IngestionFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      environment: sharedEnvironment,
      functionName: 'mundial-ingestion',
      handler: 'lambda-entries/ingestion-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Fetches match data from openfootball source on schedule',
    });

    // Grant DynamoDB access to Lambda functions
    this.table.grantReadData(matchesFn);
    this.table.grantReadWriteData(predictionsFn);
    this.table.grantReadWriteData(scoringFn);
    this.table.grantReadData(leaderboardFn);
    this.table.grantReadWriteData(ingestionFn);

    // ─────────────────────────────────────────────────────────────────────────
    // Cognito User Pool
    // ─────────────────────────────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'MundialUserPool', {
      userPoolName: 'mundial-predictions-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: {
        preSignUp: preSignUpFn,
      },
    });

    // ─── Microsoft OIDC Identity Provider ───
    const microsoftClientId = props?.microsoftClientId ?? process.env.MICROSOFT_CLIENT_ID ?? '';
    const microsoftClientSecret = props?.microsoftClientSecret ?? process.env.MICROSOFT_CLIENT_SECRET ?? '';
    const microsoftTenantId = props?.microsoftTenantId ?? process.env.MICROSOFT_TENANT_ID ?? '';

    let microsoftProvider: cognito.UserPoolIdentityProviderOidc | undefined;

    if (microsoftClientId && microsoftClientSecret && microsoftTenantId) {
      microsoftProvider = new cognito.UserPoolIdentityProviderOidc(this, 'MicrosoftOIDC', {
        userPool: this.userPool,
        name: 'Microsoft',
        clientId: microsoftClientId,
        clientSecret: microsoftClientSecret,
        issuerUrl: `https://login.microsoftonline.com/${microsoftTenantId}/v2.0`,
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.other('email'),
          fullname: cognito.ProviderAttribute.other('name'),
          givenName: cognito.ProviderAttribute.other('given_name'),
          familyName: cognito.ProviderAttribute.other('family_name'),
        },
        attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
      });
    }

    // ─── Cognito Domain (Hosted UI) ───
    const cognitoDomainPrefix = props?.cognitoDomainPrefix ?? 'a2c-mundialito-2026';
    const cognitoDomain = this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: { domainPrefix: cognitoDomainPrefix },
    });

    // ─── User Pool Client (with OAuth for Microsoft login) ───
    const callbackUrl = props?.callbackUrl ?? 'http://localhost:3000';

    const supportedProviders: cognito.UserPoolClientIdentityProvider[] = [
      cognito.UserPoolClientIdentityProvider.COGNITO,
    ];
    if (microsoftProvider) {
      supportedProviders.push(cognito.UserPoolClientIdentityProvider.custom('Microsoft'));
    }

    const userPoolClient = new cognito.UserPoolClient(this, 'MundialUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'mundial-spa-client',
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [callbackUrl, `${callbackUrl}/`],
        logoutUrls: [callbackUrl, `${callbackUrl}/`],
      },
      supportedIdentityProviders: supportedProviders,
      preventUserExistenceErrors: true,
    });

    if (microsoftProvider) {
      userPoolClient.node.addDependency(microsoftProvider);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // API Gateway REST API with Cognito Authorizer
    // ─────────────────────────────────────────────────────────────────────────
    this.api = new apigateway.RestApi(this, 'MundialApi', {
      restApiName: 'Mundial Predictions API',
      description: 'REST API for the Mundial 2026 Predictions Portal',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
    });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: 'mundial-cognito-authorizer',
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // API Routes
    const matchesResource = this.api.root.addResource('matches');
    matchesResource.addMethod('GET', new apigateway.LambdaIntegration(matchesFn), authMethodOptions);

    const predictionsResource = this.api.root.addResource('predictions');
    const matchWinnerResource = predictionsResource.addResource('match-winner');
    matchWinnerResource.addMethod('POST', new apigateway.LambdaIntegration(predictionsFn), authMethodOptions);

    const finalScoreResource = predictionsResource.addResource('final-score');
    finalScoreResource.addMethod('POST', new apigateway.LambdaIntegration(predictionsFn), authMethodOptions);

    const tournamentWinnerResource = predictionsResource.addResource('tournament-winner');
    tournamentWinnerResource.addMethod('POST', new apigateway.LambdaIntegration(predictionsFn), authMethodOptions);

    const myPredictionsResource = predictionsResource.addResource('me');
    myPredictionsResource.addMethod('GET', new apigateway.LambdaIntegration(predictionsFn), authMethodOptions);

    const leaderboardResource = this.api.root.addResource('leaderboard');
    leaderboardResource.addMethod('GET', new apigateway.LambdaIntegration(leaderboardFn), authMethodOptions);

    // ─────────────────────────────────────────────────────────────────────────
    // S3 Bucket for SPA Static Hosting
    // ─────────────────────────────────────────────────────────────────────────
    this.spaBucket = new s3.Bucket(this, 'SpaBucket', {
      bucketName: `mundial-predictions-spa-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CloudFront Distribution
    // ─────────────────────────────────────────────────────────────────────────
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: 'OAI for Mundial Predictions SPA',
    });
    this.spaBucket.grantRead(originAccessIdentity);

    const distributionProps: cloudfront.DistributionProps = {
      defaultBehavior: {
        origin: new origins.S3Origin(this.spaBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    };

    // Add custom domain and certificate if provided
    if (props?.certificateArn && props?.domainName) {
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        props.certificateArn,
      );
      Object.assign(distributionProps, {
        domainNames: [props.domainName],
        certificate,
      });
    }

    this.distribution = new cloudfront.Distribution(this, 'SpaDistribution', distributionProps);

    // ─────────────────────────────────────────────────────────────────────────
    // EventBridge Rule (6-hour ingestion schedule)
    // ─────────────────────────────────────────────────────────────────────────
    new events.Rule(this, 'IngestionScheduleRule', {
      ruleName: 'mundial-ingestion-schedule',
      description: 'Triggers match data ingestion every 6 hours',
      schedule: events.Schedule.rate(cdk.Duration.hours(6)),
      targets: [new targets.LambdaFunction(ingestionFn, {
        retryAttempts: 2,
      })],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Predictions API Lambda (Function URL - no API Gateway)
    // ─────────────────────────────────────────────────────────────────────────
    const predictionsApiFn = new lambda.Function(this, 'PredictionsApiFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        ...sharedEnvironment,
        SPA_BUCKET_NAME: this.spaBucket.bucketName,
      },
      functionName: 'mundial-predictions-api',
      handler: 'lambda-entries/predictions-api.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Direct Lambda URL for predictions CRUD - no API Gateway',
    });

    this.table.grantReadWriteData(predictionsApiFn);
    this.spaBucket.grantRead(predictionsApiFn);

    const predictionsApiUrl = predictionsApiFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['https://d177g7w9z1lqwo.cloudfront.net'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
      },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Games Sync Lambda (fetches from worldcup26.ir → S3 every 2 hours)
    // ─────────────────────────────────────────────────────────────────────────
    const syncGamesFn = new lambda.Function(this, 'SyncGamesFunction', {
      runtime: sharedRuntime,
      memorySize: 256,
      timeout: cdk.Duration.seconds(60),
      environment: {
        SPA_BUCKET_NAME: this.spaBucket.bucketName,
        CLOUDFRONT_DISTRIBUTION_ID: this.distribution.distributionId,
        DYNAMODB_TABLE_NAME: tableName,
      },
      functionName: 'mundial-sync-games',
      handler: 'lambda-entries/sync-games-handler.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      description: 'Syncs games data from worldcup26.ir to S3 and recalculates scoring every 2 hours',
    });

    this.spaBucket.grantPut(syncGamesFn);
    this.table.grantReadWriteData(syncGamesFn);
    syncGamesFn.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`],
    }));

    new events.Rule(this, 'SyncGamesScheduleRule', {
      ruleName: 'mundial-sync-games-schedule',
      description: 'Syncs games data from worldcup26.ir every 2 hours',
      schedule: events.Schedule.rate(cdk.Duration.hours(2)),
      targets: [new targets.LambdaFunction(syncGamesFn, {
        retryAttempts: 2,
      })],
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Stack Outputs
    // ─────────────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'PredictionsApiUrl', {
      value: predictionsApiUrl.url,
      description: 'Lambda Function URL for predictions API',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${cognitoDomainPrefix}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain URL',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'SpaBucketName', {
      value: this.spaBucket.bucketName,
      description: 'S3 bucket for SPA static files',
    });

    new cdk.CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'SQS Dead Letter Queue URL for scoring failures',
    });
  }
}

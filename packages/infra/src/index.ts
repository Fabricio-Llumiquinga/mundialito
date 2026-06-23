#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { MundialPredictionsStack } from './mundial-predictions-stack';

const app = new cdk.App();

new MundialPredictionsStack(app, 'MundialPredictionsStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  tableName: process.env.DYNAMODB_TABLE_NAME ?? 'MundialPredictions',
  domainName: process.env.DOMAIN_NAME,
  certificateArn: process.env.CERTIFICATE_ARN,
  // Microsoft Entra ID (Azure AD) for federated login
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID,
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  microsoftTenantId: process.env.MICROSOFT_TENANT_ID,
  cognitoDomainPrefix: process.env.COGNITO_DOMAIN_PREFIX ?? 'a2c-mundialito-2026',
  callbackUrl: process.env.CALLBACK_URL ?? 'http://localhost:3000',
});

app.synth();

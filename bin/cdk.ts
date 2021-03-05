#!/usr/bin/env node

import * as cdk from '@aws-cdk/core';
import { AppSyncLambdaStack } from '../lib/app-sync-lambda-stack';
import { S3Stack } from '../lib/s3-stack';
import { SecretsStack } from '../lib/secrets-stack';

const app = new cdk.App();

const modelName = 'reddit-finance-analysis';

const s3Stack = new S3Stack(app, `${modelName}-s3-stack`, { modelName });

const secretsStack = new SecretsStack(app, `${modelName}-secrets-stack`, { modelName });

new AppSyncLambdaStack(app, `${modelName}-app-sync-lambda-stack`, { modelName, bucket: s3Stack.dataBucket, redditScraperSecret: secretsStack.redditScraperSecret });

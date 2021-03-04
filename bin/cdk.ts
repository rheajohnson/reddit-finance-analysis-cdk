#!/usr/bin/env node

import * as cdk from '@aws-cdk/core';
import { LambdaStack } from '../lib/lambda-stack';
import { S3Stack } from '../lib/s3-stack';
import { SecretsStack } from '../lib/secrets-stack';

const app = new cdk.App();

const modelName = 'reddit-finance-analysis';

const secretsStack = new SecretsStack(app, `${modelName}-secrets-stack`, { modelName });

const s3Stack = new S3Stack(app, `${modelName}-s3-stack`, { modelName });

new LambdaStack(app, `${modelName}-lambda-stack`, { modelName, bucket: s3Stack.dataBucket, secret: secretsStack.templatedSecret });

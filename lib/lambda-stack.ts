import { Construct, Stack, Duration, StackProps } from '@aws-cdk/core';
import { Schedule, Rule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { Runtime } from '@aws-cdk/aws-lambda';
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { Bucket } from '@aws-cdk/aws-s3';
import { Secret } from "@aws-cdk/aws-secretsmanager";

interface Props extends StackProps {
    modelName: string;
    bucket: Bucket;
    secret: Secret;
}


export class LambdaStack extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const redditFinanceScraperFn = new PythonFunction(this, "RedditFinanceScraperFn", {
            functionName: `${props.modelName}-scraper-fn`,
            entry: 'src/reddit-finance-scraper-fn',
            index: 'main.py',
            timeout: Duration.minutes(15),
            handler: 'lambda_handler',
            runtime: Runtime.PYTHON_3_8,
            memorySize: 512,
            reservedConcurrentExecutions: 1,
            retryAttempts: 0,
            environment: {
                AWS_BUCKET_NAME: props.bucket.bucketName,
                AWS_SECRET_NAME: props.secret.secretName
            }
        });

        // give readwrite permission to bucket
        props.bucket.grantReadWrite(redditFinanceScraperFn)

        // give read permission to secretsmanager
        props.secret.grantRead(redditFinanceScraperFn)

        // Run lambda every hour
        const lambdaRule = new Rule(this, 'lambdaRule', {
            schedule: Schedule.expression('cron(0 * ? * * *)')
        });
        lambdaRule.addTarget(new LambdaFunction(redditFinanceScraperFn));
    }
}

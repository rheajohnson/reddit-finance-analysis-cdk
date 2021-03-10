import { Construct, Stack, StackProps, CfnOutput, Duration, } from '@aws-cdk/core';
import { Schema, GraphqlApi, AuthorizationType } from '@aws-cdk/aws-appsync';
import { Secret } from "@aws-cdk/aws-secretsmanager";
import { Bucket } from '@aws-cdk/aws-s3';
import { join } from 'path';
import { Schedule, Rule } from '@aws-cdk/aws-events';
import { LambdaFunction } from '@aws-cdk/aws-events-targets';
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { Function, Runtime, AssetCode } from '@aws-cdk/aws-lambda';

interface Props extends StackProps {
    modelName: string;
    bucket: Bucket;
    redditScraperSecret: Secret;
}

export class AppSyncLambdaStack extends Stack {
    public readonly api: GraphqlApi;
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        // Creates the AppSync API
        const api = new GraphqlApi(this, 'Api', {
            name: `${props.modelName}-api`,
            schema: Schema.fromAsset(join(__dirname, 'schema.graphql')),
            authorizationConfig: {
                defaultAuthorization: {
                    authorizationType: AuthorizationType.API_KEY,
                },
            },
            xrayEnabled: true,
        });

        // Prints out the AppSync GraphQL endpoint to the terminal
        new CfnOutput(this, "GraphQLAPIURL", {
            value: api.graphqlUrl
        });

        // Prints out the AppSync GraphQL API key to the terminal
        new CfnOutput(this, "GraphQLAPIKey", {
            value: api.apiKey || ''
        });

        // Prints out the stack region to the terminal
        new CfnOutput(this, "Stack Region", {
            value: this.region || ''
        });

        // sharing between stacks
        this.api = api;

        // lambdas to interface with getting / updating data in s3
        const appSyncFn = new Function(this, 'AppSyncFn', {
            functionName: `${props.modelName}-appsync-fn`,
            code: new AssetCode('src'),
            handler: 'app-sync-fn.handler',
            timeout: Duration.seconds(60),
            runtime: Runtime.NODEJS_12_X,
            environment: {
                AWS_BUCKET_NAME: props.bucket.bucketName,
            }
        });

        // set function as a data source for the AppSync API
        const lambdaDs = api.addLambdaDataSource('lambdaDatasource', appSyncFn);

        lambdaDs.createResolver({
            typeName: "Query",
            fieldName: "getAnalysisData"
        });

        lambdaDs.createResolver({
            typeName: "Mutation",
            fieldName: "updateAnalysisData"
        });

        // give readwrite permission to bucket
        props.bucket.grantReadWrite(appSyncFn)

        // lambda used to scrape reddit and analyze, then post to AppSync API to update
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
                AWS_SECRET_NAME: props.redditScraperSecret.secretName,
                GRAPHQL_API_ENDPOINT: api.graphqlUrl,
                GRAPHQL_API_KEY: api.apiKey || ""
            }
        });

        // give readwrite permission to bucket
        props.bucket.grantReadWrite(redditFinanceScraperFn)

        // give read permission to secretsmanager
        props.redditScraperSecret.grantRead(redditFinanceScraperFn)

        // Run lambda every hour
        const lambdaRule = new Rule(this, 'LambdaRule', {
            schedule: Schedule.expression('rate(5 minutes)')
        });
        lambdaRule.addTarget(new LambdaFunction(redditFinanceScraperFn));
    }
}

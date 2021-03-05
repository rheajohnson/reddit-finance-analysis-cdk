import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { Secret } from "@aws-cdk/aws-secretsmanager";
import { GraphqlApi } from '@aws-cdk/aws-appsync';

interface Props extends StackProps {
    modelName: string;
}

export class SecretsStack extends Stack {
    public readonly redditScraperSecret: Secret;

    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        // Templated secret
        const redditScraperSecret = new Secret(this, 'RedditScraperSecret', {
            secretName: `${props.modelName}-scraper-fn-env-vars`,
        });

        // Templated secret
        new Secret(this, 'FrontEndSecret', {
            secretName: `${props.modelName}-ui-env-vars`,
        });

        // sharing between stacks
        this.redditScraperSecret = redditScraperSecret;
    }
}

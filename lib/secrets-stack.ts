import { Construct, Stack, StackProps } from '@aws-cdk/core';
import { Secret } from "@aws-cdk/aws-secretsmanager";

interface Props extends StackProps {
    modelName: string;
}

export class SecretsStack extends Stack {
    public readonly templatedSecret: Secret;

    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        // Templated secret
        const templatedSecret = new Secret(this, 'TemplatedSecret', {
            secretName: `${props.modelName}-env-vars`,
        });

        // sharing between stacks
        this.templatedSecret = templatedSecret;
    }
}

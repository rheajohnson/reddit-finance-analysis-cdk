import { Construct, Stack, StackProps, RemovalPolicy } from '@aws-cdk/core';
import { Bucket } from '@aws-cdk/aws-s3';

interface Props extends StackProps {
    modelName: string;
}

export class S3Stack extends Stack {
    public readonly dataBucket: Bucket;

    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const dataBucket = new Bucket(this, "DataBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
            bucketName: `${props.modelName}-data`
        })

        // sharing between stacks
        this.dataBucket = dataBucket;
    }
}

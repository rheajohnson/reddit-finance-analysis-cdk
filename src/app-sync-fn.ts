import AWS = require("aws-sdk");


type AnalysisData = {
    "sentiment": string,
    "topMention": string,
    "totalComments": number,
    "totalPosts": number,
    "totalSubreddits": number,
    "timestamp": string
}

type AppSyncEvent = {
    info: {
        fieldName: string
    },
    arguments: {
        analysisData: AnalysisData
    }
}

const getS3Files = async () => {
    let response: any = {}
    const s3 = new AWS.S3();
    const s3Response: any = await s3.getObject({ Bucket: process.env.AWS_BUCKET_NAME || "", Key: 'analysisData.json' }).promise()
    if (s3Response && s3Response.Body) {
        response = JSON.parse(s3Response.Body.toString('utf-8'))
    }
    return response
}

const updateS3Files = async (data: object) => {
    const s3 = new AWS.S3();
    await s3.putObject({ Bucket: process.env.AWS_BUCKET_NAME || "", Key: 'analysisData.json', Body: JSON.stringify(data), ContentType: 'application/json; charset=utf-8' }).promise()
    return data
}

export const handler = async (event: AppSyncEvent) => {
    switch (event.info.fieldName) {
        case "getAnalysisData":
            return await getS3Files();
        case "updateAnalysisData":
            return await updateS3Files(event.arguments.analysisData);
        default:
            return null;
    }
};

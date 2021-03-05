import AWS = require("aws-sdk");

type AnalysisData = {
    tickerAnalysis: string;
    sentimentAnalysis: string;
}

type AppSyncEvent = {
    info: {
        fieldName: string
    },
    arguments: {
        analysisData: AnalysisData
    }
}

const analysisTypeFileMap: Array<string> = ["sentimentAnalysis", "tickerAnalysis"]

const getS3Files = async () => {
    const response: any = {}
    const s3 = new AWS.S3();
    for (const analysisType of analysisTypeFileMap) {
        const s3Response: any = await s3.getObject({ Bucket: process.env.AWS_BUCKET_NAME || "", Key: `${analysisType}.json` }).promise()
        if (s3Response && s3Response.Body) {
            const objectData = s3Response.Body.toString('utf-8')
            response[analysisType] = objectData;
        }
    }
    return response
}

const updateS3Files = async (data: any) => {
    const s3 = new AWS.S3();
    for (const analysisType of analysisTypeFileMap) {
        console.log(data[analysisType])
        await s3.putObject({ Bucket: process.env.AWS_BUCKET_NAME || "", Key: `${analysisType}.json`, Body: data[analysisType], ContentType: 'application/json; charset=utf-8' }).promise()
    }
    return data
}

export const handler = async (event: AppSyncEvent) => {
    console.log(event)
    switch (event.info.fieldName) {
        case "getAnalysisData":
            return await getS3Files();
        case "updateAnalysisData":
            return await updateS3Files(event.arguments.analysisData);
        default:
            return null;
    }
};
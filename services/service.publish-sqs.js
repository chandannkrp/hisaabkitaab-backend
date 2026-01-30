import { SendMessageCommand } from "@aws-sdk/client-sqs"
import { sqs } from "../config/config.sqs.js"

export const publishIngestionEvent = async (payload) => {
    try{
        sqs.send(
            new SendMessageCommand({
                QueueUrl: process.env.HK_SQS_INGESTION_QUEUE_URL,
                MessageBody: JSON.stringify(payload)
            })
        )
    }
    catch(error){
        console.error("Error publishing ingestion event to SQS:", error)
    }
}
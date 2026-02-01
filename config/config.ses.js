import {SESClient} from "@aws-sdk/client-ses"

export const sesClient = new SESClient({
    region: process.env.AWS_SES_REGION,
    credentials:{
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
})
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { fileURLToPath } from 'url'

import fs from 'fs'
import handlebars from 'handlebars'
import path from 'path'
import dotenv from 'dotenv'


dotenv.config()

//create a transporter 
const ses = new SESClient({
    region: process.env.AWS_SES_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    },
})

//send the mail
export const sendEmail = async (to, subject, templateName, replacements) => {
    try{
        const filePath = path.resolve(fileURLToPath(new URL(`../templates/${templateName}`, import.meta.url)));
        const source = fs.readFileSync(filePath, 'utf-8')
        const template = handlebars.compile(source)
        const html = template(replacements)

        const command = new SendEmailCommand({
          Source: `HisaabKitaab <${process.env.AWS_SES_FROM_EMAIL}>`,
          Destination: {
            ToAddresses: [to],
          },
          Message: {
            Subject: {
              Data: subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: html,
                Charset: 'UTF-8',
              },
            },
          }
        });

        await ses.send(command)

        console.log(`Email sent to ${to}`)
    }
    catch(error){
        console.log(`Error sending email: ${error.message}`)
        throw error;
    }
}
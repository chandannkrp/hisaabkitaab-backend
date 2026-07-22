import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { fileURLToPath } from 'url'

import fs from 'fs'
import handlebars from 'handlebars'
import path from 'path'
import '../config/config.env.js'
import { sendEmail as sendSmtpEmail } from './service.mailling.js'

//create a transporter
const ses = new SESClient({
    region: process.env.AWS_SES_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
})

const sendSesEmail = async (to, subject, templateName, replacements) => {
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

        console.log(`Email sent to ${to} via SES`)
    }
    catch(error){
        console.log(`Error sending email: ${error.message}`)
        throw error;
    }
}

// SES's sender domain isn't verified outside production yet, so local/dev sends over
// plain SMTP instead. Production keeps using SES.
export const sendEmail = (to, subject, templateName, replacements) => {
    if (process.env.NODE_ENV !== 'production') {
        return sendSmtpEmail(to, subject, templateName, replacements);
    }
    return sendSesEmail(to, subject, templateName, replacements);
}
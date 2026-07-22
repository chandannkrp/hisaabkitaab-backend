import nodemailer from 'nodemailer'
import fs from 'fs'
import handlebars from 'handlebars'
import { fileURLToPath  } from 'url'
import path from 'path'
import '../config/config.env.js'

//create a transporter 
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    service: process.env.SMTP_SERVICE,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

//send the mail
export const sendEmail = async (to, subject, templateName, replacements) => {
    try{
        const filePath = path.resolve(fileURLToPath(new URL(`../templates/${templateName}`, import.meta.url)));
        const source = fs.readFileSync(filePath, 'utf-8')
        const template = handlebars.compile(source)
        const html = template(replacements)

        //send email
        const mailOptions = {
            from: `HisaabKitaab <${process.env.SMTP_EMAIL}>`,
            to,
            subject,
            html,
        }

        await transporter.sendMail(mailOptions)
        console.log(`Email sent to ${to}`)
    }
    catch(error){
        console.log(`Error sending email: ${error.message}`)
        throw error;
    }
}
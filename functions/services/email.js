import nodemailer from "nodemailer";
export const EMAIL_SECRETS = ["SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM_ADDRESS"];
export async function sendEmail({ to, subject, text }) {
 const port = Number(process.env.SMTP_PORT || 465);
 return nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }).sendMail({ from: process.env.EMAIL_FROM_ADDRESS, to, subject, text });
}

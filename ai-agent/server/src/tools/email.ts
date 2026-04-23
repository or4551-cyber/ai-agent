import * as nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  html = false
): Promise<string> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return 'Error: Email not configured. Set SMTP_USER and SMTP_PASS in .env';
  }

  const t = getTransporter();
  const info = await t.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    ...(html ? { html: body } : { text: body }),
  });

  return `Email sent to ${to} — Message ID: ${info.messageId}`;
}

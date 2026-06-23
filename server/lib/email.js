const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SES_SMTP_ENDPOINT ?? 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SES_SMTP_USER,
    pass: process.env.SES_SMTP_PASSWORD,
  },
});

const FROM = process.env.SES_FROM_EMAIL ?? 'noreply@chifufu.com';
const PUBLIC_URL = process.env.PUBLIC_URL ?? 'https://cheap-food-production.up.railway.app';

async function sendVerificationEmail(email, token) {
  const url = `${PUBLIC_URL}/api/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: `Chifufu <${FROM}>`,
    to: email,
    subject: 'Verify your Chifufu account',
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1D9E75;margin:0 0 8px">Welcome to Chifufu</h2>
        <p style="color:#444;margin:0 0 24px">Click below to verify your email address.</p>
        <a href="${url}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;border-radius:10px;padding:14px 28px;font-weight:500">Verify Email</a>
        <p style="color:#999;font-size:12px;margin-top:24px">Link expires in 24 hours. If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const url = `${PUBLIC_URL}/api/auth/reset-password?token=${token}`;
  await transporter.sendMail({
    from: `Chifufu <${FROM}>`,
    to: email,
    subject: 'Reset your Chifufu password',
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1D9E75;margin:0 0 8px">Password reset</h2>
        <p style="color:#444;margin:0 0 24px">Click below to reset your password. This link expires in 1 hour.</p>
        <a href="${url}" style="display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;border-radius:10px;padding:14px 28px;font-weight:500">Reset Password</a>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };

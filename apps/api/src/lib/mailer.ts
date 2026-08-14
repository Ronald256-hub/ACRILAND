import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export async function sendPasswordReset(email: string, resetUrl: string): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    if (env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.info(`[DEV ONLY] Password reset for ${email}: ${resetUrl}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: "Reset your ACRILAND Fleet password",
    text: `Use this link to reset your password: ${resetUrl}`
  });
}

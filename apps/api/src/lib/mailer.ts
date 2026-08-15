import nodemailer from "nodemailer";
import { env } from "../config/env.js";

function transporter(){
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  return nodemailer.createTransport({host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_SECURE,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS}});
}

export async function sendPasswordReset(email: string, resetUrl: string): Promise<void> {
  const mailer=transporter();
  if(!mailer){if(env.NODE_ENV==="production")throw new Error("SMTP is not configured");console.info(`[DEV ONLY] Password reset for ${email}: ${resetUrl}`);return;}
  await mailer.sendMail({from:env.SMTP_FROM,to:email,subject:"Reset your ACRILAND Fleet password",text:`Use this link to reset your password: ${resetUrl}`});
}

export async function sendOperationalNotification(email:string,subject:string,body:string):Promise<void>{
  const mailer=transporter();
  if(!mailer){if(env.NODE_ENV==="production")throw new Error("SMTP is not configured");console.info(`[DEV ONLY] Operational notification for ${email}: ${subject}\n${body}`);return;}
  await mailer.sendMail({from:env.SMTP_FROM,to:email,subject,text:body});
}

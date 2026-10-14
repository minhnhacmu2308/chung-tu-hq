import nodemailer from "nodemailer";
import type { Mailer } from "../application/ports.js";

/** Dev: in ra log (thấy link xác thực/mời ngay trong terminal). */
export class ConsoleMailer implements Mailer {
  async send(msg: { to: string; subject: string; text: string }) {
    console.log(`[mail] → ${msg.to}\n[mail] ${msg.subject}\n${msg.text.split("\n").map((l) => `[mail]   ${l}`).join("\n")}`);
  }
}

/** SMTP (Mailpit ở dev: smtp://localhost:1025; production: nhà cung cấp SMTP – xem BACKEND-TODO T6). */
export class SmtpMailer implements Mailer {
  private transport;
  constructor(smtpUrl: string, private from = "KhaiBáo AI <no-reply@khaibao.ai>") {
    this.transport = nodemailer.createTransport(smtpUrl);
  }
  async send(msg: { to: string; subject: string; text: string; html?: string }) {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}) });
  }
}

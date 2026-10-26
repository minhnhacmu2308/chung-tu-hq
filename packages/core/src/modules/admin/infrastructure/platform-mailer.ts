// Bộ gửi mail dùng chung cả hệ thống: ưu tiên máy chủ SMTP cấu hình ở khu Quản trị (bảng mail_settings, mật khẩu mã hóa),
// không có thì dùng .env (MAIL=smtp + SMTP_URL), cuối cùng là in ra log (dev). Email hệ thống của identity cũng đi qua đây.
import nodemailer, { type Transporter } from "nodemailer";
import { createLogger } from "../../../shared/log.js";
import type { KeyVault, MailSettingsRow, PlatformMailer } from "../application/ports.js";
import type { DrizzleAdminUow } from "./drizzle-uow.js";

const log = createLogger({ name: "mail" });
/** Đọc lại cấu hình tối đa mỗi phút (đổi ở khu Quản trị thì gọi invalidate để áp dụng ngay trên tiến trình đó). */
const CACHE_MS = 60_000;
const DEFAULT_FROM = "KhaiBáo AI <no-reply@khaibao.ai>";

type Active = { transport: Transporter | null; from: string; replyTo?: string };

/** Câu lỗi dễ hiểu cho các lỗi SMTP hay gặp (sai mật khẩu ứng dụng Gmail, sai cổng, máy chủ không tới được). */
export function smtpErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: string; responseCode?: number })?.code;
  const rc = (e as { responseCode?: number })?.responseCode;
  if (code === "EAUTH" || rc === 535) return "Sai tên đăng nhập hoặc mật khẩu SMTP (Gmail cần Mật khẩu ứng dụng, không phải mật khẩu tài khoản)";
  if (code === "ESOCKET" || code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ECONNREFUSED") return `Không kết nối được máy chủ SMTP (${code}) – kiểm tra máy chủ, cổng và SSL/TLS`;
  if (code === "EENVELOPE") return `Địa chỉ người nhận/gửi bị từ chối: ${raw}`;
  return raw.slice(0, 300);
}

export class DbPlatformMailer implements PlatformMailer {
  private cached: { at: number; active: Active } | null = null;
  constructor(
    private uow: DrizzleAdminUow,
    private vault: KeyVault,
    private env: { MAIL?: string; SMTP_URL?: string | undefined },
  ) {}

  private build(s: MailSettingsRow | null): Active {
    if (s) {
      const pass = s.passwordCiphertext ? this.vault.decrypt(s.passwordCiphertext, s.keyVersion) : undefined;
      const transport = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, ...(s.username ? { auth: { user: s.username, pass: pass ?? "" } } : {}) });
      return { transport, from: `${s.fromName.replace(/[<>"]/g, "")} <${s.fromEmail}>`, ...(s.replyTo ? { replyTo: s.replyTo } : {}) };
    }
    if (this.env.MAIL === "smtp" && this.env.SMTP_URL) return { transport: nodemailer.createTransport(this.env.SMTP_URL), from: DEFAULT_FROM };
    return { transport: null, from: DEFAULT_FROM };
  }

  private async active(): Promise<Active> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.active;
    const active = this.build(await this.uow.run((r) => r.mailSettings.get()));
    this.cached = { at: Date.now(), active };
    return active;
  }

  invalidate() {
    this.cached = null;
  }

  async send(msg: { to: string; subject: string; html?: string; text: string }) {
    const a = await this.active();
    if (!a.transport) {
      // Chưa cấu hình gửi mail: dev đọc link trong log.
      log.info("mail (chưa cấu hình SMTP – chỉ ghi log)", { to: msg.to, subject: msg.subject, text: msg.text });
      return;
    }
    try {
      await a.transport.sendMail({ from: a.from, to: msg.to, subject: msg.subject, text: msg.text, ...(msg.html ? { html: msg.html } : {}), ...(a.replyTo ? { replyTo: a.replyTo } : {}) });
    } catch (e) {
      throw new Error(smtpErrorMessage(e));
    }
  }

  async verify(s: { host: string; port: number; secure: boolean; username: string; password: string | null }) {
    const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure, connectionTimeout: 10_000, ...(s.username ? { auth: { user: s.username, pass: s.password ?? "" } } : {}) });
    try {
      await t.verify();
    } catch (e) {
      throw new Error(smtpErrorMessage(e));
    } finally {
      t.close();
    }
  }
}

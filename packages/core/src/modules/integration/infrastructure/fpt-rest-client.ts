// HTTP tới FPT.VNACCS: đăng nhập lấy JWT (giữ tới gần hết hạn) → gọi nghiệp vụ kèm Bearer + objVNACCS_ACCOUNT.
// Đường dẫn khớp mẫu curl thật (docdungapivnacss): /api/auth/login, /api/EDA. Các nghiệp vụ khác GIẢ ĐỊNH /api/<OP> – sửa ở FPT_PATHS.
// Dev: trỏ FPT_API_BASE_URL tới apps/fpt-mock (http://localhost:7070). KHÔNG trỏ tới cổng thật khi dev – cổng thật là production.
import { z } from "zod";
import type { FptVnaccsCredentials } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import type { FptHttpClient, FptOperation } from "./fpt-vnaccs-gateway.js";

export const FPT_PATHS: Record<FptOperation | "LOGIN", string> = {
  LOGIN: "/api/auth/login",
  EDA: "/api/EDA",
  IDA: "/api/IDA",
  EDC: "/api/EDC",
  IDC: "/api/IDC",
  HYS: "/api/HYS",
  IEX: "/api/IEX",
};

const LoginResponseSchema = z.object({ token: z.string().min(1), expiration: z.iso.datetime({ offset: true }) });

/** Lỗi tạm (mạng, timeout, 429, 5xx) – ném Error thường để BullMQ retry; lỗi vĩnh viễn ném DomainError. */
export class FptTransientError extends Error {
  constructor(message: string, readonly status?: number) { super(message); this.name = "FptTransientError"; }
}

export type FptRestClientOptions = {
  baseUrl: string;
  /** Tài khoản API (đăng nhập lấy token) – khác tài khoản VNACCS của từng doanh nghiệp. */
  username: string;
  password: string;
  timeoutMs?: number;
  /** Lấy token mới khi còn ít hơn chừng này giây (tránh hết hạn giữa chừng). */
  refreshBeforeSeconds?: number;
  fetch?: typeof fetch;
  now?: () => Date;
};

export class FptRestClient implements FptHttpClient {
  private token: { value: string; expiresAt: number } | null = null;
  private loggingIn: Promise<string> | null = null;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;
  constructor(private readonly opts: FptRestClientOptions) {
    this.fetchFn = opts.fetch ?? fetch;
    this.now = opts.now ?? (() => new Date());
  }

  async post(op: FptOperation, body: unknown, creds: FptVnaccsCredentials): Promise<unknown> {
    const payload = { objVNACCS_ACCOUNT: creds, ...(body as Record<string, unknown>) };
    let res = await this.send(FPT_PATHS[op], payload, await this.getToken());
    if (res.status === 401) {
      // Token bị thu hồi/hết hạn sớm: đăng nhập lại đúng một lần.
      this.token = null;
      res = await this.send(FPT_PATHS[op], payload, await this.getToken());
      if (res.status === 401) throw domainError("GATEWAY_ERROR", `FPT từ chối token cho ${op} sau khi đăng nhập lại (HTTP 401)`);
    }
    return this.readJson(op, res);
  }

  /** Đăng nhập mới (bỏ token đang giữ) – dùng cho "Kiểm tra kết nối". */
  async ping(): Promise<{ expiresAt: Date }> {
    this.token = null;
    await this.getToken();
    return { expiresAt: new Date(this.token!.expiresAt) };
  }

  /** Token còn hạn thì dùng lại; nhiều lời gọi song song chỉ đăng nhập một lần. */
  private async getToken(): Promise<string> {
    const margin = (this.opts.refreshBeforeSeconds ?? 300) * 1000;
    if (this.token && this.token.expiresAt - margin > this.now().getTime()) return this.token.value;
    this.loggingIn ??= this.login().finally(() => { this.loggingIn = null; });
    return this.loggingIn;
  }

  private async login(): Promise<string> {
    const res = await this.send(FPT_PATHS.LOGIN, { username: this.opts.username, password: this.opts.password });
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw domainError("INTEGRATION_NOT_CONFIGURED", `Đăng nhập API FPT thất bại (HTTP ${res.status}) – kiểm tra FPT_API_USERNAME/FPT_API_PASSWORD`);
    }
    const parsed = LoginResponseSchema.safeParse(await this.readJson("LOGIN", res));
    if (!parsed.success) throw domainError("GATEWAY_ERROR", `Phản hồi đăng nhập FPT sai định dạng: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.token = { value: parsed.data.token, expiresAt: Date.parse(parsed.data.expiration) };
    return parsed.data.token;
  }

  private async send(path: string, body: unknown, token?: string): Promise<Response> {
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}${path}`;
    try {
      return await this.fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 60_000),
      });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      throw new FptTransientError(timeout ? `FPT không phản hồi sau ${this.opts.timeoutMs ?? 60_000}ms (${path})` : `Không kết nối được FPT (${path}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async readJson(op: string, res: Response): Promise<unknown> {
    if (res.status === 429 || res.status >= 500) throw new FptTransientError(`FPT trả HTTP ${res.status} cho ${op}`, res.status);
    const text = await res.text();
    if (!res.ok) throw domainError("GATEWAY_ERROR", `FPT trả HTTP ${res.status} cho ${op}${res.status === 404 ? " – kiểm tra FPT_PATHS/FPT_API_BASE_URL" : ""}`, { status: res.status, body: text.slice(0, 2000) });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw domainError("GATEWAY_ERROR", `FPT trả nội dung không phải JSON cho ${op}`, { body: text.slice(0, 2000) });
    }
  }
}

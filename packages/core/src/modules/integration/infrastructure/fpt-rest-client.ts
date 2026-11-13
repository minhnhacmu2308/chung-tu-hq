// HTTP tới FPT.VNACCS: đăng nhập lấy JWT (giữ tới gần hết hạn) → gọi nghiệp vụ kèm Bearer + objVNACCS_ACCOUNT.
// Đường dẫn: mẫu curl thật (/api/auth/login, /api/EDA) + Postman FPT 21/04/2026 cho các nghiệp vụ còn lại (docs/vnaccs-api). Xác thực Bearer.
// Dev: trỏ FPT_API_BASE_URL tới apps/fpt-mock (http://localhost:7070). KHÔNG trỏ tới cổng thật khi dev – cổng thật là production.
import { z } from "zod";
import type { FptVnaccsCredentials } from "@kb/contracts";
import { fptOutcome, observeFpt } from "../../../observability/index.js";
import { domainError } from "../../../shared/errors.js";
import type { FptCallMeta, FptHttpClient, FptOperation } from "./fpt-vnaccs-gateway.js";
import type { FptExchange } from "./fpt-trace.js";

export const FPT_PATHS: Record<FptOperation | "LOGIN", string> = {
  LOGIN: "/api/auth/login",
  IDA: "/api/IDA", IDB: "/api/IDB", IDC: "/api/IDC", IDD: "/api/IDD", IDA01: "/api/IDA01", IDE: "/api/IDE", IID: "/api/IID",
  EDA: "/api/EDA", EDB: "/api/EDB", EDC: "/api/EDC", EDD: "/api/EDD", EDA01: "/api/EDA01", EDE: "/api/EDE", IEX: "/api/IEX",
  AMA: "/api/AMA", AMB: "/api/AMB", AMC: "/api/AMC",
  HYS: "/api/HYS",
  VNACCSREP: "/api/VNACCSREP",
  V5ContainerReq: "/api/V5ContainerReq", V5ContainerRes: "/api/V5ContainerRes",
  KVGS: "/api/KVGS",
};
/** Body phẳng (không objVNACCS_ACCOUNT / mật khẩu VNACCS): V5 theo Excel đặc tả (USER_ID); KVGS theo đặc tả API-KVGS (TK_SOTK, TK_NGAYDK, TK_MAHQ, MA_DV). */
const FLAT_BODY_OPS: ReadonlySet<FptOperation> = new Set(["V5ContainerReq", "V5ContainerRes", "KVGS"]);

const LoginResponseSchema = z.object({ token: z.string().min(1), expiration: z.iso.datetime({ offset: true }) });

/** Lỗi tạm (mạng, timeout, 429, 5xx) – ném Error thường để BullMQ retry; lỗi vĩnh viễn ném DomainError. */
export class FptTransientError extends Error {
  constructor(message: string, readonly status?: number, readonly timeout = false) { super(message); this.name = "FptTransientError"; }
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
  /** GỠ LỖI TẠM (FPT_DEBUG_TRACE): nhận từng lần gọi nghiệp vụ (body gửi + phản hồi thô; chưa che – bên nhận che). Không gọi cho đăng nhập. */
  trace?: (e: FptExchange) => void;
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

  async post(op: FptOperation, body: unknown, creds: FptVnaccsCredentials | null, meta?: FptCallMeta): Promise<unknown> {
    if (!creds && !FLAT_BODY_OPS.has(op)) throw domainError("INTEGRATION_NOT_CONFIGURED", `Chưa cấu hình tài khoản VNACCS cho ${op}`);
    // VNACCSREP: body chính là tài khoản VNACCS (phẳng, theo Postman); nghiệp vụ khác bọc trong objVNACCS_ACCOUNT.
    const payload = op === "VNACCSREP" ? { ...creds } : FLAT_BODY_OPS.has(op) ? { ...(body as Record<string, unknown>) } : { objVNACCS_ACCOUNT: creds, ...(body as Record<string, unknown>) };
    const at = this.now();
    const started = performance.now();
    let status: number | null = null;
    let responseText: string | null = null;
    let error: string | null = null;
    let thrown: unknown;
    try {
      let res = await this.send(FPT_PATHS[op], payload, await this.getToken());
      status = res.status;
      if (res.status === 401) {
        // Token bị thu hồi/hết hạn sớm: đăng nhập lại đúng một lần.
        this.token = null;
        res = await this.send(FPT_PATHS[op], payload, await this.getToken());
        status = res.status;
        if (res.status === 401) throw domainError("GATEWAY_ERROR", `FPT từ chối token cho ${op} sau khi đăng nhập lại (HTTP 401)`);
      }
      return await this.readJson(op, res, (text) => { responseText = text; });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      thrown = e;
      throw e;
    } finally {
      observeFpt(op, fptOutcome(thrown), (performance.now() - started) / 1000);
      if (this.opts.trace && meta) {
        try {
          this.opts.trace({ ...meta, operation: op, path: FPT_PATHS[op], at, status, durationMs: performance.now() - started, request: payload, responseText, error });
        } catch {
          // Nhật ký gỡ lỗi không được làm hỏng lần gọi thật.
        }
      }
    }
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
      throw new FptTransientError(timeout ? `FPT không phản hồi sau ${this.opts.timeoutMs ?? 60_000}ms (${path})` : `Không kết nối được FPT (${path}): ${e instanceof Error ? e.message : String(e)}`, undefined, timeout);
    }
  }

  private async readJson(op: string, res: Response, onText?: (text: string) => void): Promise<unknown> {
    if (res.status === 429 || res.status >= 500) {
      if (onText) onText(await res.text().catch(() => ""));
      throw new FptTransientError(`FPT trả HTTP ${res.status} cho ${op}`, res.status);
    }
    const text = await res.text();
    onText?.(text);
    if (!res.ok) throw domainError("GATEWAY_ERROR", `FPT trả HTTP ${res.status} cho ${op}${res.status === 404 ? " – kiểm tra FPT_PATHS/FPT_API_BASE_URL" : ""}`, { status: res.status, body: text.slice(0, 2000) });
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw domainError("GATEWAY_ERROR", `FPT trả nội dung không phải JSON cho ${op}`, { body: text.slice(0, 2000) });
    }
  }
}

// Gọi HTTP chung cho adapter Gmail / Microsoft Graph: hết giờ, 401 → MailAuthError, parse JSON bằng Zod.
import type { z } from "zod";
import { MailAuthError, type MailTokens } from "../application/ports.js";

export type FetchFn = typeof fetch;
export type HttpOpts = { fetch?: FetchFn; timeoutMs?: number };

/** Lỗi HTTP khác 401 (thử lại được) – không kèm nội dung phản hồi để tránh lộ dữ liệu thư vào log. */
export class MailHttpError extends Error {
  constructor(readonly status: number, what: string) {
    super(`${what}: HTTP ${status}`);
    this.name = "MailHttpError";
  }
}

export class MailHttp {
  private fetchFn: FetchFn;
  private timeoutMs: number;
  constructor(opts: HttpOpts = {}) {
    // Gọi qua hàm bọc để test thay được fetch toàn cục sau khi tạo adapter.
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** GET có Bearer token. 401 → MailAuthError (token hết hạn / bị thu hồi). */
  async get<T>(url: string, accessToken: string, schema: z.ZodType<T>, what: string): Promise<T> {
    const res = await this.fetchFn(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 401) throw new MailAuthError(`${what}: 401`);
    if (!res.ok) throw new MailHttpError(res.status, what);
    return schema.parse(await res.json());
  }

  /**
   * POST form tới token endpoint OAuth. `invalid_grant` (refresh token bị thu hồi / hết hạn, code sai) và lỗi xác thực
   * khác → MailAuthError; lỗi máy chủ → MailHttpError (thử lại được).
   */
  async token<T>(url: string, form: Record<string, string>, schema: z.ZodType<T>): Promise<T> {
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      const body = (await res.json().catch(() => ({}))) as { error?: unknown };
      throw new MailAuthError(`token: ${typeof body.error === "string" ? body.error : res.status}`);
    }
    if (!res.ok) throw new MailHttpError(res.status, "token");
    return schema.parse(await res.json());
  }
}

/** Token từ phản hồi OAuth; `expires_in` (giây) → mốc hết hạn ISO UTC. */
export function toTokens(t: { access_token: string; refresh_token?: string | undefined; expires_in: number }, now: Date, prevRefresh: string | null = null): MailTokens {
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? prevRefresh, expiresAt: new Date(now.getTime() + t.expires_in * 1000).toISOString() };
}

/** Chạy `fn` cho từng phần tử, tối đa `n` việc cùng lúc, giữ nguyên thứ tự kết quả. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

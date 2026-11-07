// GỠ LỖI TẠM (env FPT_DEBUG_TRACE=true): lưu body gửi FPT + phản hồi thô của từng lần gọi để người khai xem ở màn Truyền khi thử cổng thật.
// Redis list mỗi doanh nghiệp (mới nhất trước, giữ TRACE_MAX lần gọi, hết hạn sau TRACE_TTL_SEC). Ghi lỗi không làm hỏng lần truyền.
// Bỏ tính năng: xóa file này + mọi chỗ grep "FPT_DEBUG_TRACE" (env, contracts, client, gateway, container, route, màn Truyền).
import { randomUUID } from "node:crypto";
import { FptTraceEntrySchema, type FptTraceEntry } from "@kb/contracts";
import type { Redis } from "ioredis";
import { createLogger } from "../../../shared/log.js";
import type { FptTraceReader } from "../application/customs-ports.js";

/** Một lần gọi như client thấy – chưa che, chưa cắt. */
export type FptExchange = {
  orgId: string;
  dossierId?: string;
  operation: string;
  path: string;
  at: Date;
  status: number | null;
  durationMs: number;
  request: unknown;
  /** Thân phản hồi dạng chữ (null khi không nhận được). */
  responseText: string | null;
  error: string | null;
};

export const TRACE_MAX = 100;
export const TRACE_TTL_SEC = 7 * 24 * 3600;
/** Chuỗi dài hơn (base64 tệp HYS, ediBase64) chỉ giữ phần đầu. */
const LONG_STRING = 2_000;
const SECRET_KEY = /password|access_key|accesskey|secret|token|terminal_access/i;
const log = createLogger({ name: "core" });

function clean(v: unknown, key: string | null): unknown {
  if (Array.isArray(v)) return v.map((x) => clean(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, clean(x, k)]));
  if (typeof v === "string") {
    if (key && SECRET_KEY.test(key) && v) return "***";
    if (v.length > LONG_STRING) return `${v.slice(0, 200)}… (cắt bớt, dài ${v.length} ký tự)`;
  }
  return v;
}

/** Che mật khẩu / terminal key / token (ở mọi độ sâu, cả objVNACCS_ACCOUNT FPT trả lại) và cắt chuỗi rất dài. Thuần. */
export function toTraceEntry(e: FptExchange, id: string = randomUUID()): FptTraceEntry {
  let response: unknown = e.responseText;
  if (e.responseText !== null) {
    try {
      response = JSON.parse(e.responseText) as unknown;
    } catch {
      response = e.responseText;
    }
  }
  return {
    id, at: e.at.toISOString(), operation: e.operation, path: e.path, dossierId: e.dossierId ?? null, status: e.status,
    durationMs: Math.max(0, Math.round(e.durationMs)), request: clean(e.request, null), response: clean(response, null), error: e.error,
  };
}

const keyOf = (orgId: string) => `fpt-trace:${orgId}`;

export class RedisFptTrace implements FptTraceReader {
  constructor(private redis: Redis) {}

  /** Không chờ, không ném: lỗi Redis chỉ ghi log. */
  record(e: FptExchange): void {
    const key = keyOf(e.orgId);
    void this.redis.multi().lpush(key, JSON.stringify(toTraceEntry(e))).ltrim(key, 0, TRACE_MAX - 1).expire(key, TRACE_TTL_SEC).exec()
      .catch((err: unknown) => log.warn("Không ghi được nhật ký gỡ lỗi FPT", { orgId: e.orgId, err }));
  }

  /** Lời gọi của hồ sơ + lời gọi chung của doanh nghiệp (VNACCSREP), mới nhất trước. */
  async list(orgId: string, dossierId: string): Promise<FptTraceEntry[]> {
    const rows = await this.redis.lrange(keyOf(orgId), 0, TRACE_MAX - 1);
    const out: FptTraceEntry[] = [];
    for (const row of rows) {
      let json: unknown;
      try {
        json = JSON.parse(row) as unknown;
      } catch {
        continue;
      }
      const parsed = FptTraceEntrySchema.safeParse(json);
      if (parsed.success && (parsed.data.dossierId === null || parsed.data.dossierId === dossierId)) out.push(parsed.data);
    }
    return out;
  }
}

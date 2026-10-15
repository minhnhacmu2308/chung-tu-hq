// Phân loại HS: HSCodePro qua HTTP (docs/integrations/hscodepro-api-v1.md) hoặc giả theo từ khóa trên catalog_hs.
import { randomUUID } from "node:crypto";
import { HsAcceptedSchema, HsApiErrorBodySchema, HsJobSchema, type HsAnswerRequest, type HsCreateRequest, type HsJob, type HsJobItem, type HsTax } from "@kb/contracts";
import type { ZodType } from "zod";
import { HsApiError, type HsCatalogRow, type HsClassificationService } from "../application/ports.js";

const PREFIX = "/internal/v1/hs-classifications";
const MAX_429_RETRIES = 2;

export class HscodeproHttpService implements HsClassificationService {
  readonly name = "hscodepro";
  private fetchFn: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private timeoutMs: number;
  constructor(private baseUrl: string, private apiKey: string, opts: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; timeoutMs?: number } = {}) {
    this.fetchFn = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private async call<T>(method: "GET" | "POST", path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, "")}${PREFIX}${path}`;
    for (let attempt = 0; ; attempt++) {
      const res = await this.fetchFn(url, {
        method,
        headers: { "X-Internal-Api-Key": this.apiKey, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        await this.sleep(Math.max(1, Number(res.headers.get("retry-after") ?? 5) || 5) * 1000);
        continue;
      }
      if (!res.ok) {
        const e = HsApiErrorBodySchema.safeParse(data);
        throw new HsApiError(res.status, e.success ? e.data.code : `HTTP_${res.status}`, e.success ? e.data.error : `HSCodePro trả HTTP ${res.status}`, e.success ? e.data.details : undefined);
      }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new HsApiError(502, "BAD_RESPONSE", `HSCodePro trả dữ liệu không đúng cấu trúc (${parsed.error.issues[0]?.path.join(".") ?? ""})`);
      return parsed.data;
    }
  }

  create(req: HsCreateRequest) {
    return this.call("POST", "", HsJobSchema, req);
  }
  get(jobId: string) {
    return this.call("GET", `/${encodeURIComponent(jobId)}`, HsJobSchema);
  }
  async answer(jobId: string, itemId: string, body: HsAnswerRequest) {
    await this.call("POST", `/${encodeURIComponent(jobId)}/items/${encodeURIComponent(itemId)}/answers`, HsAcceptedSchema, body);
  }
  async cancel(jobId: string) {
    await this.call("POST", `/${encodeURIComponent(jobId)}/cancel`, HsAcceptedSchema);
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFC");
const digits = (c: string) => c.replace(/\D/g, "");

/** Giả (dev/test, không mạng): chấm điểm từ khóa catalog_hs, lượt hoàn tất ngay; thuế theo biểu (MFN hoặc FTA theo co_form). */
export class FakeHsClassificationService implements HsClassificationService {
  readonly name = "fake-hs";
  private jobs = new Map<string, HsJob>();
  private cache: HsCatalogRow[] | null = null;
  constructor(private load: () => Promise<HsCatalogRow[]>) {}

  async create(req: HsCreateRequest): Promise<HsJob> {
    const rows = (this.cache ??= await this.load());
    const items: HsJobItem[] = req.items.map((it) => {
      const text = norm(it.description);
      const inv6 = digits(it.invoice_hs ?? "").slice(0, 6);
      const scored = rows
        .map((h) => {
          const hits = h.keywords.filter((k) => text.includes(norm(k))).length;
          const prefix = inv6.length === 6 && digits(h.code).startsWith(inv6);
          return hits || prefix ? { h, score: Math.min(93, (hits ? 50 + 12 * hits : 55) + (prefix ? 10 : 0)) } : null;
        })
        .filter((x): x is { h: HsCatalogRow; score: number } => x !== null)
        .sort((a, b) => b.score - a.score);
      const tax = (h: HsCatalogRow): HsTax => {
        const pref = it.co_form ? h.pref[it.co_form.toUpperCase()] : undefined;
        return { import: pref !== undefined ? { rate: Number(pref), basis: "FTA", agreement: it.co_form!.toUpperCase() } : { rate: Number(h.mfn), basis: "MFN", agreement: null }, vat: { rate: Number(h.vat), note: null }, source_date: req.import_date ?? "" };
      };
      const [best, ...rest] = scored;
      if (!best) return { id: randomUUID(), line_no: it.line_no, status: "failed", question: null, result: null, error: { code: "NO_SUGGESTION", message: "Không có gợi ý – chọn mã HS thủ công" } };
      return {
        id: randomUUID(), line_no: it.line_no, status: "completed", question: null, error: null,
        result: {
          hs_code: digits(best.h.code), hs_description: best.h.description, confidence: best.score, reasoning: "Gợi ý giả theo từ khóa biểu thuế (chế độ dev).", legal_basis: [], warnings: best.h.policy ? [best.h.policy] : [], tax: tax(best.h),
          alternatives: rest.slice(0, 3).map((x) => ({ hs_code: digits(x.h.code), hs_description: x.h.description, confidence: x.score, why_not: "Ít từ khóa khớp hơn", tax: tax(x.h) })),
        },
      };
    });
    const job: HsJob = { id: randomUUID(), external_ref: req.external_ref ?? null, import_date: req.import_date ?? "", status: "completed", created_at: new Date(0).toISOString(), items };
    this.jobs.set(job.id, job);
    return job;
  }
  async get(jobId: string) {
    const j = this.jobs.get(jobId);
    if (!j) throw new HsApiError(404, "NOT_FOUND", "Không tìm thấy lượt phân loại");
    return j;
  }
  async answer() {
    throw new HsApiError(409, "INVALID_STATE", "Chế độ giả không hỏi lại");
  }
  async cancel() {}
}

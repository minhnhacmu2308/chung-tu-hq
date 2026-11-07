// Chỉ số Prometheus của KhaiBáo AI (ADR 0012, docs/OBSERVABILITY.md). Hạ tầng cắt ngang như log: domain KHÔNG import file này.
// Một registry cho mỗi tiến trình (web = 1 tiến trình `next start`, worker = 1 tiến trình), giữ trên globalThis để Next (HMR, nhiều
// bundle route) không đăng ký trùng metric. Nhãn luôn ít giá trị: route dạng mẫu (`/api/dossiers/:id`), mã nghiệp vụ, tên queue –
// KHÔNG id, orgId, email hay đường dẫn thô.
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

export const METRIC_PREFIX = "khaibao_";

export type MetricsService = "web" | "worker";
export type FptOutcome = "ok" | "rejected" | "error" | "timeout";
export type JobOutcome = "completed" | "retry" | "failed";
export type AiOutcome = "ok" | "invalid" | "error";
export type CustomsMessageOutcome = "ok" | "rejected" | "error";
export type QueueState = "waiting" | "active" | "delayed" | "failed";
export const QUEUE_STATES: readonly QueueState[] = ["waiting", "active", "delayed", "failed"];

/** Phần của BullMQ Queue mà bộ thu gauge cần (không import bullmq ở đây). */
export type QueueCountSource = { name: string; getJobCounts(...types: QueueState[]): Promise<Record<string, number>> };

function build() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: METRIC_PREFIX });
  const r = [registry];
  return {
    registry,
    httpRequests: new Counter({ name: `${METRIC_PREFIX}http_requests_total`, help: "Số request API theo route mẫu, method, nhóm mã trạng thái", labelNames: ["method", "route", "status_class"] as const, registers: r }),
    httpDuration: new Histogram({ name: `${METRIC_PREFIX}http_request_duration_seconds`, help: "Thời gian xử lý request API (giây)", labelNames: ["method", "route"] as const, buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60], registers: r }),
    fptRequests: new Counter({ name: `${METRIC_PREFIX}fpt_requests_total`, help: "Số lời gọi nghiệp vụ FPT.VNACCS theo mã nghiệp vụ và kết quả HTTP", labelNames: ["op", "outcome"] as const, registers: r }),
    fptDuration: new Histogram({ name: `${METRIC_PREFIX}fpt_request_duration_seconds`, help: "Thời gian một lời gọi FPT.VNACCS (giây, gồm đăng nhập lại)", labelNames: ["op"] as const, buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120], registers: r }),
    jobs: new Counter({ name: `${METRIC_PREFIX}jobs_total`, help: "Số lần chạy job BullMQ: completed, retry (lỗi còn thử lại), failed (hết số lần thử)", labelNames: ["queue", "outcome"] as const, registers: r }),
    jobDuration: new Histogram({ name: `${METRIC_PREFIX}job_duration_seconds`, help: "Thời gian chạy một lần job (giây)", labelNames: ["queue"] as const, buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600], registers: r }),
    aiCalls: new Counter({ name: `${METRIC_PREFIX}ai_calls_total`, help: "Số lời gọi AI theo loại việc, model và kết quả (invalid = model trả kết quả không dùng được)", labelNames: ["kind", "model", "outcome"] as const, registers: r }),
    aiCost: new Counter({ name: `${METRIC_PREFIX}ai_cost_vnd_total`, help: "Chi phí AI đã ghi usage_events (VND, chỉ để theo dõi – số tiền chuẩn nằm trong DB)", labelNames: ["kind"] as const, registers: r }),
    customsMessages: new Counter({ name: `${METRIC_PREFIX}customs_messages_total`, help: "Số nghiệp vụ gửi Hải quan qua outbox theo mã và kết quả", labelNames: ["op", "outcome"] as const, registers: r }),
    declarationsAccepted: new Counter({ name: `${METRIC_PREFIX}declarations_accepted_total`, help: "Số tờ khai được Hải quan chấp nhận khai chính thức (IDC/EDC có phân luồng)", labelNames: ["kind"] as const, registers: r }),
    buildInfo: new Gauge({ name: `${METRIC_PREFIX}build_info`, help: "Phiên bản đang chạy (giá trị luôn 1)", labelNames: ["version", "commit"] as const, registers: r }),
    queueSources: [] as QueueCountSource[],
    queueGauge: null as Gauge<"queue" | "state"> | null,
  };
}

type Metrics = ReturnType<typeof build>;
const KEY = Symbol.for("khaibao.metrics");
type G = typeof globalThis & { [KEY]?: Metrics };

/** Registry + metric của tiến trình (tạo lần đầu gọi). */
export function metrics(): Metrics {
  const g = globalThis as G;
  return (g[KEY] ??= build());
}

/** Gắn nhãn `service` cho mọi metric + build_info. Gọi lại nhiều lần không sao. */
export function configureMetrics(opts: { service: MetricsService; version?: string | undefined; commit?: string | undefined }): void {
  const m = metrics();
  m.registry.setDefaultLabels({ service: opts.service });
  m.buildInfo.reset();
  m.buildInfo.set({ version: opts.version || "unknown", commit: (opts.commit || "unknown").slice(0, 12) }, 1);
}

/** Văn bản định dạng Prometheus (text exposition). */
export async function metricsText(): Promise<{ body: string; contentType: string }> {
  const m = metrics();
  return { body: await m.registry.metrics(), contentType: m.registry.contentType };
}

// ---------- HTTP ----------

const ID_LIKE = /^(?:\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z]{2,8}_[0-9A-Za-z]{10,}|[0-9A-HJKMNP-TV-Z]{26})$/i;

/**
 * Đường dẫn thật → route mẫu cho nhãn: đoạn trùng giá trị tham số động của Next được thay bằng `:tên` (catch-all → `:tên*`);
 * đoạn còn lại trông như id (số, uuid, ulid, `doc_01H…`) → `:id` để chặn bùng nhãn. Ví dụ `/api/dossiers/dos_01J…/fields/x`
 * với params `{ id: "dos_01J…", fieldId: "x" }` → `/api/dossiers/:id/fields/:fieldId`.
 */
export function routeTemplate(pathname: string, params: Record<string, string | string[] | undefined> = {}): string {
  const byValue = new Map<string, string>();
  const catchAll = new Map<string, string>();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v) byValue.set(v, `:${k}`);
    else if (Array.isArray(v) && v.length) catchAll.set(v.join("/"), `:${k}*`);
  }
  let path = pathname.replace(/\/+$/, "") || "/";
  for (const [joined, name] of catchAll) {
    const enc = joined.split("/").map(encodeURIComponent).join("/");
    if (path.endsWith(`/${joined}`)) path = `${path.slice(0, -joined.length)}${name}`;
    else if (path.endsWith(`/${enc}`)) path = `${path.slice(0, -enc.length)}${name}`;
  }
  return path
    .split("/")
    .map((seg) => {
      if (!seg || seg.startsWith(":")) return seg;
      let decoded = seg;
      try {
        decoded = decodeURIComponent(seg);
      } catch {
        // giữ nguyên đoạn mã hóa lỗi
      }
      return byValue.get(decoded) ?? byValue.get(seg) ?? (ID_LIKE.test(decoded) ? ":id" : seg);
    })
    .join("/");
}

export const statusClass = (status: number): string => (status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` : "other");

export function observeHttp(method: string, route: string, status: number, seconds: number): void {
  const m = metrics();
  m.httpRequests.inc({ method, route, status_class: statusClass(status) });
  m.httpDuration.observe({ method, route }, seconds);
}

// ---------- FPT.VNACCS ----------

/**
 * Lỗi ném ra từ FptRestClient.post → outcome: timeout (`timeout` = true), error (lỗi tạm – mạng, 429, 5xx: có cờ `transient`
 * hoặc tên FptTransientError), rejected (DomainError: 4xx, phản hồi sai định dạng, token bị từ chối), còn lại error.
 * Lỗi nghiệp vụ VNACCS trong body 200 vẫn là `ok` ở tầng HTTP – xem khaibao_customs_messages_total.
 */
export function fptOutcome(e: unknown): FptOutcome {
  if (e === undefined || e === null) return "ok";
  if (typeof e === "object") {
    const o = e as { timeout?: unknown; name?: unknown; code?: unknown };
    if (o.timeout === true) return "timeout";
    if (o.name === "FptTransientError") return "error";
    if (typeof o.code === "string") return "rejected";
  }
  return "error";
}

export function observeFpt(op: string, outcome: FptOutcome, seconds: number): void {
  const m = metrics();
  m.fptRequests.inc({ op, outcome });
  m.fptDuration.observe({ op }, seconds);
}

// ---------- Job ----------

export function observeJob(queue: string, outcome: JobOutcome, seconds?: number): void {
  const m = metrics();
  m.jobs.inc({ queue, outcome });
  if (seconds !== undefined && Number.isFinite(seconds) && seconds >= 0) m.jobDuration.observe({ queue }, seconds);
}

/**
 * Gauge `khaibao_queue_jobs{queue,state}` đọc số job của từng queue lúc Prometheus scrape (không chạy nền).
 * Queue lỗi kết nối → bỏ qua queue đó lần này (giữ scrape thành công; `up` vẫn = 1, xem log Redis).
 */
export function registerQueueCollector(sources: QueueCountSource[]): void {
  const m = metrics();
  m.queueSources = sources;
  if (m.queueGauge) return;
  m.queueGauge = new Gauge({
    name: `${METRIC_PREFIX}queue_jobs`,
    help: "Số job trong queue BullMQ theo trạng thái (đọc lúc scrape)",
    labelNames: ["queue", "state"] as const,
    registers: [m.registry],
    async collect() {
      this.reset();
      await Promise.all(
        metrics().queueSources.map(async (q) => {
          try {
            const counts = await q.getJobCounts(...QUEUE_STATES);
            for (const state of QUEUE_STATES) this.set({ queue: q.name, state }, Number(counts[state] ?? 0));
          } catch {
            // Redis lỗi: queue này không có số lần scrape này.
          }
        }),
      );
    },
  });
}

// ---------- AI ----------

/** Đếm một lời gọi AI quanh `fn`: AiDataError (model trả kết quả không dùng được) → invalid, lỗi khác → error. */
export async function observeAiCall<T>(kind: string, model: string, fn: () => Promise<T>): Promise<T> {
  try {
    const out = await fn();
    metrics().aiCalls.inc({ kind, model, outcome: "ok" });
    return out;
  } catch (e) {
    const outcome: AiOutcome = e instanceof Error && e.name === "AiDataError" ? "invalid" : "error";
    metrics().aiCalls.inc({ kind, model, outcome });
    throw e;
  }
}

/** Cộng chi phí AI (VND) – chỉ để theo dõi; số tiền tính bằng Decimal ở billing rồi đổi sang số ở đây. */
export function addAiCostVnd(kind: string, vnd: number): void {
  if (Number.isFinite(vnd) && vnd > 0) metrics().aiCost.inc({ kind }, vnd);
}

// ---------- Nghiệp vụ ----------

export function countCustomsMessage(op: string, outcome: CustomsMessageOutcome): void {
  metrics().customsMessages.inc({ op, outcome });
}

export function countDeclarationAccepted(kind: string): void {
  metrics().declarationsAccepted.inc({ kind });
}

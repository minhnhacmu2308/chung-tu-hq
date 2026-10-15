// Giả lập API phân loại HS của HSCodePro (docs/integrations/hscodepro-api-v1.md) – chỉ dev/test.
// Không ngẫu nhiên: mỗi lần GET lượt, mỗi dòng tiến một bậc queued → processing → kết quả.
// Kịch bản theo mô tả: "thanh trượt"/"guide" → need_info (hỏi công dụng); "FAIL-TEST" → failed; còn lại → completed.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HS_CO_FORMS, HsAnswerRequestSchema, HsCreateRequestSchema, type HsCreateItem, type HsJob, type HsJobItem, type HsResult, type HsTax } from "@kb/contracts";
import type { z } from "zod";

type Item = HsJobItem & { input: HsCreateItem; answered: boolean };
type Job = Omit<HsJob, "items" | "status"> & { items: Item[]; coDate: string };

const PREFIX = "/internal/v1/hs-classifications";
const FTA: Record<string, string> = { E: "ACFTA", D: "ATIGA", AK: "AKFTA", VK: "VKFTA" };
const RULES: { re: RegExp; code: string; desc: string; mfn: number; alt: { code: string; desc: string; why: string } }[] = [
  { re: /thanh trượt|guide|linear/i, code: "84669390", desc: "Bộ phận của máy công cụ – loại khác", mfn: 0, alt: { code: "84833090", desc: "Gối đỡ trục – loại khác", why: "Không phải gối đỡ trục" } },
  { re: /vít me|ball screw/i, code: "84834090", desc: "Loại khác", mfn: 5, alt: { code: "84669390", desc: "Loại khác", why: "Chỉ đúng khi là bộ phận chuyên dùng riêng cho máy công cụ nhóm 84.56–84.61" } },
  { re: /ổ bi|bearing/i, code: "84821000", desc: "Ổ bi", mfn: 5, alt: { code: "84828000", desc: "Loại khác, kể cả ổ kết hợp bi cầu/bi đũa", why: "Mô tả là ổ bi cầu" } },
  { re: /gối đỡ|pillow block/i, code: "84833090", desc: "Loại khác", mfn: 3, alt: { code: "84832090", desc: "Gối đỡ có lắp ổ bi", why: "Mô tả không ghi có lắp ổ bi" } },
];
const FALLBACK = { code: "84879000", desc: "Bộ phận máy khác", mfn: 3, alt: { code: "73269099", desc: "Sản phẩm bằng sắt thép khác", why: "Hàng là bộ phận máy" } };

const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(body));
};
const fail = (res: ServerResponse, status: number, code: string, error: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) => send(res, status, { error, code, ...extra }, headers);
const readJson = (req: IncomingMessage) => new Promise<unknown>((resolve, reject) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c)).on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(Symbol.for("bad-json")); }
  }).on("error", reject);
});
/** Đường dẫn lỗi kiểu tài liệu: items[1].origin_country. */
const fieldOf = (path: PropertyKey[]) => path.reduce<string>((s, p) => (typeof p === "number" ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)), "");
const details = (e: z.ZodError) => e.issues.map((i) => ({ field: fieldOf(i.path), message: i.message }));

function tax(rate: number, coForm: string | null | undefined, date: string, origin: string): HsTax {
  const form = coForm?.toUpperCase() ?? null;
  const fta = form && FTA[form] && !(form === "E" && origin !== "CN" && !/^(VN|TH|MY|SG|ID|PH|LA|KH|MM|BN)$/.test(origin)) ? FTA[form]! : null;
  return { import: fta ? { rate: 0, basis: "FTA", agreement: fta } : { rate, basis: "MFN", agreement: null }, vat: { rate: 10, note: null }, source_date: date };
}

function resultFor(it: Item, date: string): HsResult {
  const rule = RULES.find((r) => r.re.test(it.input.description)) ?? FALLBACK;
  const t = (rate: number) => tax(rate, it.input.co_form, date, it.input.origin_country);
  const warnings = it.input.co_form && !FTA[it.input.co_form.toUpperCase()] ? [`Mẫu C/O ${it.input.co_form} chưa có trong biểu FTA của máy giả lập – áp thuế MFN`] : [];
  return {
    hs_code: rule.code, hs_description: rule.desc, confidence: it.answered ? 91 : 83,
    reasoning: `Giả lập: mô tả "${it.input.description.slice(0, 60)}" khớp nhóm ${rule.code.slice(0, 4)}.`,
    legal_basis: ["Quy tắc tổng quát 1 và 6"], warnings, tax: t(rule.mfn),
    alternatives: [{ hs_code: rule.alt.code, hs_description: rule.alt.desc, confidence: 12, why_not: rule.alt.why, tax: t(rule.mfn) }],
  };
}

function step(it: Item, date: string) {
  if (it.status === "queued") it.status = "processing";
  else if (it.status === "processing") {
    if (/FAIL-TEST/.test(it.input.description)) Object.assign(it, { status: "failed", error: { code: "AGENT_FAILED", message: "AI gặp lỗi khi phân loại (giả lập)." } });
    else if (!it.answered && /thanh trượt|guide/i.test(it.input.description))
      Object.assign(it, { status: "need_info", question: { id: randomUUID(), questions: [{ id: "use", header: "Công dụng", question: "Thanh trượt này dùng cho loại máy nào?", options: [{ label: "Máy công cụ (CNC, máy phay, máy tiện)" }, { label: "Máy in 3D / thiết bị tự động hoá nhẹ" }, { label: "Khác", description: "Ghi rõ ở ô trả lời khác" }], multiSelect: false }] } });
    else Object.assign(it, { status: "completed", result: resultFor(it, date) });
  }
}
const jobStatus = (j: Job): HsJob["status"] => (j.items.some((i) => i.status === "need_info") ? "need_info" : j.items.some((i) => i.status === "queued" || i.status === "processing") ? "processing" : "completed");
const view = (j: Job): HsJob => ({ id: j.id, external_ref: j.external_ref, import_date: j.import_date, status: jobStatus(j), created_at: j.created_at, items: j.items.map(({ input: _i, answered: _a, ...i }) => i) });

export function createHscodeproMock(opts: { apiKey: string; now?: () => Date; log?: (line: string) => void }) {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? (() => {});
  const jobs = new Map<string, Job>();
  let creates: number[] = [];

  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    if (req.headers["x-internal-api-key"] !== opts.apiKey) return fail(res, 401, "UNAUTHORIZED", "Thiếu hoặc sai khoá API.");
    const forced = String(req.headers["x-mock-fail"] ?? "");
    if (forced === "503") return fail(res, 503, "NOT_CONFIGURED", "Máy chủ HSCodePro chưa bật API.");
    if (forced === "500") return fail(res, 500, "INTERNAL_ERROR", "Lỗi hệ thống.");
    const rest = path.slice(PREFIX.length);

    if (rest === "" && req.method === "POST") {
      const t = now().getTime();
      creates = creates.filter((x) => t - x < 60_000);
      if (creates.length >= 20) return fail(res, 429, "RATE_LIMITED", "Gọi quá nhanh.", {}, { "retry-after": "2" });
      const body = await readJson(req);
      const p = HsCreateRequestSchema.safeParse(body);
      if (!p.success) return fail(res, 400, "INVALID_INPUT", "Dữ liệu không hợp lệ.", { details: details(p.error) });
      if (new Set(p.data.items.map((i) => i.line_no)).size !== p.data.items.length) return fail(res, 400, "INVALID_INPUT", "Trùng line_no.", { details: [{ field: "items", message: "line_no không được trùng" }] });
      const badCo = p.data.items.findIndex((i) => i.co_form && !(HS_CO_FORMS as readonly string[]).includes(i.co_form.toUpperCase()));
      if (badCo >= 0) return fail(res, 400, "INVALID_INPUT", "co_form không hợp lệ.", { details: [{ field: `items[${badCo}].co_form`, message: "Không có trong bảng co_form" }] });
      creates.push(t);
      const date = p.data.import_date ?? now().toISOString().slice(0, 10);
      const job: Job = {
        id: randomUUID(), external_ref: p.data.external_ref ?? null, import_date: date, created_at: now().toISOString(), coDate: date,
        items: [...p.data.items].sort((a, b) => a.line_no - b.line_no).map((input) => ({ id: randomUUID(), line_no: input.line_no, status: "queued", question: null, result: null, error: null, input, answered: false })),
      };
      jobs.set(job.id, job);
      log(`HSCodePro: tạo lượt ${job.id} – ${job.items.length} dòng`);
      return send(res, 202, view(job));
    }

    const m = /^\/([^/]+)(?:\/(cancel)|\/items\/([^/]+)\/answers)?$/.exec(rest);
    const job = m ? jobs.get(m[1]!) : undefined;
    if (!m || !job) return fail(res, 404, "NOT_FOUND", "Không tìm thấy lượt phân loại.");

    if (!m[2] && !m[3] && req.method === "GET") {
      for (const it of job.items) step(it, job.coDate);
      return send(res, 200, view(job));
    }
    if (m[2] && req.method === "POST") {
      let cancelled = 0;
      for (const it of job.items) if (!["completed", "failed", "cancelled"].includes(it.status)) { Object.assign(it, { status: "cancelled", question: null, error: { code: "CANCELLED", message: "Đã huỷ." } }); cancelled++; }
      return send(res, 202, { accepted: true, cancelled });
    }
    if (m[3] && req.method === "POST") {
      const it = job.items.find((i) => i.id === m[3]);
      if (!it) return fail(res, 404, "NOT_FOUND", "Không tìm thấy dòng.");
      const p = HsAnswerRequestSchema.safeParse(await readJson(req));
      if (!p.success) return fail(res, 400, "INVALID_INPUT", "Dữ liệu không hợp lệ.", { details: details(p.error) });
      if (it.status !== "need_info" || it.question?.id !== p.data.question_id) return fail(res, 409, "INVALID_STATE", "Dòng không còn chờ câu hỏi này.");
      const ids = new Set(it.question.questions.map((q) => q.id));
      if (p.data.answers.some((a) => !ids.has(a.id) || (!a.selected.length && !a.custom))) return fail(res, 400, "INVALID_INPUT", "Câu trả lời không khớp câu hỏi.", { details: [{ field: "answers", message: "Mỗi câu hỏi cần một câu trả lời có lựa chọn hoặc custom" }] });
      Object.assign(it, { status: "queued", question: null, answered: true });
      return send(res, 202, { accepted: true });
    }
    return fail(res, 404, "NOT_FOUND", "Không có endpoint này.");
  }
  return { handle, reset: () => { jobs.clear(); creates = []; } };
}
